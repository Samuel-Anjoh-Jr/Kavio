import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  Role,
  UserStatus,
  VerificationPurpose,
  type UserRole as UserRoleModel,
} from '@kavio/database';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { burnPasswordTiming, hashPassword, verifyPassword } from '../lib/password.util';
import { normalizeToE164 } from '../lib/phone.util';
import { maskDestination } from '../lib/secret-hash.util';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import { buildDefaultPreferences } from '../notifications/notification.config';
import { PrismaService } from '../prisma/prisma.service';
import {
  IDENTITY_CREATED,
  IDENTITY_PHONE_VERIFIED,
  IdentityCreatedEvent,
  IdentityPhoneVerifiedEvent,
} from './auth.events';
import type { SessionTokens } from './auth.types';
import type {
  LoginDto,
  RequestOtpDto,
  ToggleTwoFactorDto,
  TwoFactorVerifyDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import type { RoleIntent, SignUpDto } from './dto/sign-up.dto';
import { identifierWhere, resolveIdentifier } from './identifier.util';
import { OtpService, type OtpIssueResult } from './otp.service';
import { SessionService } from './session.service';

const logger = createLogger('auth');

/** Maps the guest-facing intent to the identity's initial role grant. */
/**
 * Which role a new identity starts ACTIVE in. Both are granted either way — see
 * the note in `signUp` — so this only decides which home they land on.
 */
const INTENT_TO_ROLE: Record<RoleIntent, Role> = {
  find_work: Role.WORKER,
  hire: Role.CLIENT,
};

/**
 * Every new identity holds BOTH trading roles from the start.
 *
 * One person is routinely both: a plumber needs a roof fixed, and a client
 * discovers they have a skill worth advertising. Making the second role
 * something you apply for later would mean a second signup and, worse, would
 * imply the verification travels with the role — it does not. Tier and Trust
 * Score belong to the IDENTITY, which is exactly why switching costs nothing.
 *
 * Being a WORKER on paper grants no visibility on its own: the discovery gate
 * still requires a confirmed contact and an approved ID before the profile is
 * listed, so this is not a way to appear in search without verifying.
 */
const SIGNUP_ROLES: readonly Role[] = [Role.CLIENT, Role.WORKER];

export interface SignUpResult {
  userId: string;
  phone: string;
  role: Role;
  status: UserStatus;
}

/** Login either completes, or stops at a second factor. Never both. */
export type LoginResult =
  | ({ twoFactorRequired: false } & SessionTokens)
  | { twoFactorRequired: true; destination: string; expiresAt: Date; resendAvailableAt: Date };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly events: EventEmitter2,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Sign-up (ACC-04)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Creates a pending User plus their initial active UserRole. The phone number
   * is normalised to E.164 before it ever reaches the DB. The account starts
   * PENDING and becomes ACTIVE once a verification code is confirmed.
   */
  async signUp(dto: SignUpDto): Promise<SignUpResult> {
    const start = Date.now();

    const phone = normalizeToE164(dto.phone);
    if (phone === null) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Check your phone number.',
        {
          phone: ['Enter a valid Cameroon phone number, e.g. +237 6XX XX XX XX.'],
        },
      );
    }

    const role = INTENT_TO_ROLE[dto.roleIntent];
    const passwordHash = dto.password ? await hashPassword(dto.password) : null;

    try {
      // User + initial UserRole + default notification preferences are created
      // atomically: an identity must never exist without its preference matrix,
      // or the dispatcher would fall back to "enabled" for rows it should own
      // (SRS §26.1 — seed default preferences at user creation).
      const user = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            phone,
            name: dto.name,
            email: dto.email ?? null,
            passwordHash,
            passwordUpdatedAt: passwordHash ? new Date() : null,
            status: UserStatus.PENDING,
            roles: {
              create: SIGNUP_ROLES.map((granted) => ({
                role: granted,
                isActive: granted === role,
              })),
            },
          },
          select: { id: true, phone: true, status: true },
        });

        await tx.notificationPreference.createMany({
          data: buildDefaultPreferences(created.id),
          skipDuplicates: true,
        });

        return created;
      });

      // Announced, not acted on: the Trust Engine subscribes to grant the SRS
      // §21.5 starting score. Auth stays unaware that trust scoring exists.
      this.events.emit(
        IDENTITY_CREATED,
        new IdentityCreatedEvent({ userId: user.id, role, requestId: getRequestId() }),
      );

      // Never log the phone number itself (PII); the role + timing are enough.
      logger.info('Sign-up succeeded', {
        durationMs: Date.now() - start,
        result: { userId: user.id, role },
      });

      return {
        userId: user.id,
        phone: user.phone as string,
        role,
        status: user.status,
      };
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // OTP (ACC-04)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Requests a code for an identifier.
   *
   * Responds identically whether or not the account exists. The endpoint is
   * public and unauthenticated, so any difference in status or body would turn
   * it into a way to test which phone numbers are registered.
   */
  async requestOtp(dto: RequestOtpDto, locale?: string): Promise<OtpIssueResult> {
    const identifier = resolveIdentifier(dto.identifier);
    if (!identifier) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Check your phone number or email.',
        { identifier: ['Enter a valid Cameroon phone number or email address.'] },
      );
    }

    const user = await this.prisma.client.user.findUnique({
      where: identifierWhere(identifier),
      select: { id: true },
    });

    if (!user) {
      logger.info('OTP requested for unknown identifier', {
        result: { purpose: dto.purpose, kind: identifier.kind },
      });
      return this.decoyOtpResult(identifier.value);
    }

    return this.otp.issue({ userId: user.id, purpose: dto.purpose, locale });
  }

  /**
   * Verifies a code and, on success, starts a session. PHONE_VERIFICATION also
   * activates the account — proving control of the number is what turns a PENDING
   * sign-up into a usable identity.
   */
  async verifyOtp(dto: VerifyOtpDto, userAgent?: string): Promise<SessionTokens> {
    const identifier = resolveIdentifier(dto.identifier);
    if (!identifier) {
      throw this.invalidCode();
    }

    const user = await this.prisma.client.user.findUnique({
      where: identifierWhere(identifier),
      select: { id: true, status: true },
    });

    if (!user) {
      // Same error a wrong code produces, for the same anti-enumeration reason.
      throw this.invalidCode();
    }

    await this.otp.verify({ userId: user.id, purpose: dto.purpose, code: dto.code });

    if (dto.purpose === VerificationPurpose.PHONE_VERIFICATION) {
      /**
       * Mark the channel that was ACTUALLY proven, not the one the purpose is
       * named after.
       *
       * SMS is a paid aggregator that is not connected, so most of these codes
       * are delivered to an email address and the identifier is an email.
       * Stamping `phoneVerifiedAt` regardless would record a phone as confirmed
       * that nobody ever proved control of — and the discovery gate, which
       * accepts either channel, would then be passing on that false record.
       */
      const verifiedField =
        identifier.kind === 'email'
          ? { emailVerifiedAt: new Date() }
          : { phoneVerifiedAt: new Date() };

      await this.prisma.client.user.update({
        where: { id: user.id },
        data: {
          ...verifiedField,
          // Only PENDING is promoted: a SUSPENDED account must never be
          // resurrected by verifying a code.
          ...(user.status === UserStatus.PENDING ? { status: UserStatus.ACTIVE } : {}),
        },
      });

      // The first progressive check (TRU-06). The Trust Engine settles it and
      // records the +10; auth only reports that the code was proved.
      this.events.emit(
        IDENTITY_PHONE_VERIFIED,
        new IdentityPhoneVerifiedEvent({ userId: user.id, requestId: getRequestId() }),
      );
    }

    return this.sessions.createSession(user.id, userAgent);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Login (ACC-05, ACC-09)
  // ───────────────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, userAgent?: string): Promise<LoginResult> {
    const start = Date.now();
    const identifier = resolveIdentifier(dto.identifier);

    if (!identifier) {
      await burnPasswordTiming();
      throw this.invalidCredentials();
    }

    const user = await this.prisma.client.user.findUnique({
      where: identifierWhere(identifier),
      select: {
        id: true,
        passwordHash: true,
        status: true,
        locale: true,
        twoFactorEnabled: true,
      },
    });

    if (!user?.passwordHash) {
      // Equalise timing whether the account is missing or simply has no password,
      // so response latency does not become an enumeration oracle.
      await burnPasswordTiming();
      throw this.invalidCredentials();
    }

    if (!(await verifyPassword(dto.password, user.passwordHash))) {
      logger.warn('Login failed: bad credentials', {
        durationMs: Date.now() - start,
        payload: { userId: user.id },
      });
      // Bad password is ALWAYS "invalid credentials" — never "session expired".
      // Conflating them is exactly what ACC-09 forbids.
      throw this.invalidCredentials();
    }

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DELETED) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_SUSPENDED',
        'This account is not active. Contact support.',
      );
    }

    if (user.status === UserStatus.PENDING) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_NOT_VERIFIED',
        'Verify your phone number before signing in.',
      );
    }

    if (user.twoFactorEnabled) {
      // Credentials were correct, but the session is withheld until the second
      // factor lands. The challenge is a normal OTP through the same dispatcher.
      const challenge = await this.otp.issue({
        userId: user.id,
        purpose: VerificationPurpose.TWO_FACTOR,
        locale: user.locale,
      });

      logger.info('Login pending second factor', {
        durationMs: Date.now() - start,
        result: { userId: user.id },
      });

      return {
        twoFactorRequired: true,
        destination: challenge.destination,
        expiresAt: challenge.expiresAt,
        resendAvailableAt: challenge.resendAvailableAt,
      };
    }

    const tokens = await this.sessions.createSession(user.id, userAgent);

    logger.info('Login succeeded', {
      durationMs: Date.now() - start,
      result: { userId: user.id },
    });

    return { twoFactorRequired: false, ...tokens };
  }

  /** Completes a 2FA login by consuming the TWO_FACTOR code. */
  async verifyTwoFactor(dto: TwoFactorVerifyDto, userAgent?: string): Promise<SessionTokens> {
    const identifier = resolveIdentifier(dto.identifier);
    if (!identifier) {
      throw this.invalidCode();
    }

    const user = await this.prisma.client.user.findUnique({
      where: identifierWhere(identifier),
      select: { id: true, twoFactorEnabled: true },
    });

    if (!user?.twoFactorEnabled) {
      throw this.invalidCode();
    }

    await this.otp.verify({
      userId: user.id,
      purpose: VerificationPurpose.TWO_FACTOR,
      code: dto.code,
    });

    return this.sessions.createSession(user.id, userAgent);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Two-factor toggle (ACC-08)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Enables or disables 2FA, re-confirming the password first: a stolen access
   * token must not be enough to strip a factor off someone's account.
   */
  async setTwoFactor(
    userId: string,
    enabled: boolean,
    dto: ToggleTwoFactorDto,
  ): Promise<{ twoFactorEnabled: boolean }> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, email: true, phone: true },
    });

    if (!user?.passwordHash) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PASSWORD_NOT_SET',
        'Set a password before turning on two-factor authentication.',
      );
    }

    if (!(await verifyPassword(dto.password, user.passwordHash))) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'That password is not correct.',
        { password: ['Check your password and try again.'] },
      );
    }

    if (enabled && !user.email && !user.phone) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'NO_DESTINATION',
        'Add an email address before turning on two-factor authentication.',
      );
    }

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: enabled,
        twoFactorEnabledAt: enabled ? new Date() : null,
      },
    });

    logger.info('Two-factor setting changed', { result: { userId, enabled } });

    // A change to the account's security posture is always announced, so a
    // takeover cannot quietly disable the owner's second factor.
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId,
        templateKey: 'auth.two_factor_changed',
        variables: { enabled },
        requestId: getRequestId(),
      }),
    );

    return { twoFactorEnabled: enabled };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Roles (ACC-06, ACC-07)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Switches the active role and returns a FRESH token pair carrying the new
   * activeRole claim. No re-authentication: tier and Trust Score live on the
   * identity, so nothing about the user's verification state changes here.
   */
  async switchRole(userId: string, role: Role, userAgent?: string): Promise<SessionTokens> {
    const grant = await this.prisma.client.userRole.findUnique({
      where: { userId_role: { userId, role } },
      select: { id: true },
    });

    if (!grant) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'ROLE_NOT_GRANTED',
        'You do not have that role yet.',
      );
    }

    await this.prisma.client.$transaction([
      this.prisma.client.userRole.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      }),
      this.prisma.client.userRole.update({
        where: { userId_role: { userId, role } },
        data: { isActive: true },
      }),
    ]);

    logger.info('Active role switched', { result: { userId, role } });

    // A new session family, so the previous role's access token is not left
    // usable alongside the new one.
    return this.sessions.createSession(userId, userAgent);
  }

  /** Grants an additional role to an existing identity and switches to it. */
  async addRole(userId: string, role: Role, userAgent?: string): Promise<SessionTokens> {
    await this.prisma.client.userRole.upsert({
      where: { userId_role: { userId, role } },
      create: { userId, role, isActive: false },
      update: {},
    });

    logger.info('Role granted', { result: { userId, role } });

    return this.switchRole(userId, role, userAgent);
  }

  async listRoles(userId: string): Promise<UserRoleModel[]> {
    return this.prisma.client.userRole.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Shared errors
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ONE message for every credential failure — wrong password, unknown account,
   * malformed identifier. Anything more specific hands an attacker a free
   * account-existence check (ACC-09).
   */
  private invalidCredentials() {
    return new AppException(
      HttpStatus.UNAUTHORIZED,
      'INVALID_CREDENTIALS',
      'Invalid phone/email or password.',
    );
  }

  private invalidCode() {
    return new AppException(
      HttpStatus.BAD_REQUEST,
      'INVALID_CODE',
      'That code is not correct. Request a new one.',
      { code: ['Check the code and try again.'] },
    );
  }

  /**
   * A well-formed, throttle-consistent response for an identifier with no
   * account behind it. It must be indistinguishable from a real issue result.
   */
  private decoyOtpResult(destination: string): OtpIssueResult {
    const now = Date.now();
    return {
      destination: maskDestination(destination),
      expiresAt: new Date(now + 600_000),
      resendAvailableAt: new Date(now + 60_000),
      attemptsAllowed: 5,
    };
  }

  private mapUniqueViolation(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // P2002's `target` is string[] on Postgres, but the type is `unknown` and
      // some engines report a bare string — normalise both, ignore anything else.
      const target: unknown = error.meta?.target;
      const fields = Array.isArray(target)
        ? target.filter((entry): entry is string => typeof entry === 'string')
        : typeof target === 'string'
          ? [target]
          : [];

      if (fields.some((field) => field.includes('email'))) {
        return new AppException(
          HttpStatus.CONFLICT,
          'EMAIL_ALREADY_REGISTERED',
          'That email address is already registered.',
          { email: ['This email already has an account. Try logging in instead.'] },
        );
      }

      return new AppException(
        HttpStatus.CONFLICT,
        'PHONE_ALREADY_REGISTERED',
        'That phone number is already registered.',
        { phone: ['This phone number already has an account. Try logging in instead.'] },
      );
    }

    return error;
  }
}
