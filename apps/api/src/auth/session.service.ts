import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Role, UserStatus, type VerificationTier } from '@trustpro/database';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { hashSecret } from '../lib/secret-hash.util';
import { PrismaService } from '../prisma/prisma.service';
import type { SessionTokens } from './auth.types';
import { TokenService, TokenVerificationError } from './token.service';

const logger = createLogger('auth:session');

interface SessionUser {
  id: string;
  status: UserStatus;
  tier: VerificationTier;
  roles: { role: Role; isActive: boolean }[];
}

/**
 * Session lifecycle (ACC-05): issue, rotate, revoke.
 *
 * Refresh tokens are single-use. Every refresh mints a new token and marks the
 * old one rotated; if a rotated token is ever presented again, the only
 * explanation is that it was captured, so the whole FAMILY is revoked and both
 * the attacker and the legitimate client are forced to sign in again. Silent
 * re-issue would let a stolen token live forever alongside the real one.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /** Starts a brand-new session family (login, OTP verification, 2FA completion). */
  async createSession(userId: string, userAgent?: string): Promise<SessionTokens> {
    const user = await this.loadUser(userId);
    return this.issuePair(user, randomUUID(), userAgent);
  }

  /**
   * Rotates a refresh token. Anything suspicious ends the family rather than
   * merely refusing this one call.
   */
  async refresh(refreshToken: string, userAgent?: string): Promise<SessionTokens> {
    let claims;
    try {
      claims = this.tokens.verifyRefreshToken(refreshToken);
    } catch (error) {
      throw sessionError(error);
    }

    const tokenHash = hashSecret(refreshToken);
    const stored = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        rotatedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    if (!stored) {
      // Signature was valid but we have no record: the row was deleted, or this
      // token predates a full revocation. Either way it is not a live session.
      throw this.expired();
    }

    if (stored.rotatedAt || stored.revokedAt) {
      // Replay of an already-rotated token — treat the lineage as compromised.
      await this.revokeFamily(stored.familyId);
      logger.warn('Refresh token reuse detected — family revoked', {
        payload: { userId: stored.userId, familyId: stored.familyId },
      });
      throw this.expired();
    }

    if (stored.expiresAt <= new Date()) {
      throw this.expired();
    }

    const user = await this.loadUser(stored.userId);

    // A password reset or admin action after this token was minted kills it.
    const revokedAt = await this.sessionsRevokedAt(stored.userId);
    if (revokedAt && revokedAt > stored.createdAt) {
      await this.revokeFamily(stored.familyId);
      throw this.expired();
    }

    // Rotate and issue atomically: the old token must be dead before the new one
    // exists, so a crash between the two can never leave two live tokens.
    return this.prisma.client.$transaction(async () => {
      await this.prisma.client.refreshToken.update({
        where: { id: stored.id },
        data: { rotatedAt: new Date() },
      });

      return this.issuePair(user, claims.sid ?? stored.familyId, userAgent);
    });
  }

  /** Logout: kills the presented token's whole family (this device's session). */
  async revoke(refreshToken: string): Promise<void> {
    const tokenHash = hashSecret(refreshToken);

    const stored = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash },
      select: { familyId: true, userId: true },
    });

    // Logout is idempotent: an unknown or already-dead token is still a
    // successful logout, never an error the user has to interpret.
    if (!stored) {
      return;
    }

    await this.revokeFamily(stored.familyId);
    logger.info('Session revoked', { result: { userId: stored.userId } });
  }

  /** Kills every session for an identity (password reset, suspension). */
  async revokeAllForUser(userId: string): Promise<void> {
    const now = new Date();

    await this.prisma.client.$transaction([
      this.prisma.client.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.client.user.update({
        where: { id: userId },
        data: { sessionsRevokedAt: now },
      }),
    ]);

    logger.info('All sessions revoked', { result: { userId } });
  }

  private async issuePair(
    user: SessionUser,
    familyId: string,
    userAgent?: string,
  ): Promise<SessionTokens> {
    const roles = user.roles.map((r) => r.role);
    const activeRole = resolveActiveRole(user.roles);

    const access = this.tokens.signAccessToken({
      sub: user.id,
      activeRole,
      roles,
      tier: user.tier,
      status: user.status,
      sid: familyId,
    });

    const jti = randomUUID();
    const refresh = this.tokens.signRefreshToken({ sub: user.id, sid: familyId, jti });

    await this.prisma.client.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hashSecret(refresh.token),
        expiresAt: refresh.expiresAt,
        // Truncated: enough to label a device in the security notice, not enough
        // to be a fingerprint worth storing.
        userAgent: userAgent?.slice(0, 255) ?? null,
      },
    });

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      expiresIn: this.tokens.accessTtlSeconds,
      tokenType: 'Bearer',
    };
  }

  private async loadUser(userId: string): Promise<SessionUser> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        tier: true,
        roles: { select: { role: true, isActive: true } },
      },
    });

    if (!user) {
      throw this.expired();
    }

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DELETED) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_SUSPENDED',
        'This account is not active. Contact support.',
      );
    }

    return user;
  }

  private async sessionsRevokedAt(userId: string): Promise<Date | null> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { sessionsRevokedAt: true },
    });
    return user?.sessionsRevokedAt ?? null;
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private expired() {
    return new AppException(
      HttpStatus.UNAUTHORIZED,
      'SESSION_EXPIRED',
      'Your session expired. Sign in again.',
    );
  }
}

/**
 * "Session expired" is reserved for a token that was genuinely valid and aged
 * out; a malformed or forged token is INVALID_TOKEN. Collapsing the two is
 * precisely the confusion ACC-09 forbids.
 */
function sessionError(error: unknown): AppException {
  if (error instanceof TokenVerificationError && error.reason === 'expired') {
    return new AppException(
      HttpStatus.UNAUTHORIZED,
      'SESSION_EXPIRED',
      'Your session expired. Sign in again.',
    );
  }

  return new AppException(
    HttpStatus.UNAUTHORIZED,
    'INVALID_TOKEN',
    'Your sign-in could not be verified. Sign in again.',
  );
}

/**
 * The active role for a fresh token: the flagged one, else the first grant.
 * Never throws on a role-less identity — CLIENT is the safe floor, since it is
 * the least-privileged role in the catalogue.
 */
export function resolveActiveRole(roles: { role: Role; isActive: boolean }[]): Role {
  return roles.find((r) => r.isActive)?.role ?? roles[0]?.role ?? Role.CLIENT;
}
