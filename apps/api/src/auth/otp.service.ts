import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { VerificationPurpose } from '@trustpro/database';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import {
  generateNumericCode,
  hashSecret,
  maskDestination,
  secretHashEquals,
} from '../lib/secret-hash.util';
import { NotificationRequestedEvent } from '../notifications/events/notification.events';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { getOtpConfig, type OtpConfig } from './auth.config';

const logger = createLogger('auth:otp');

export interface IssueOtpInput {
  userId: string;
  purpose: VerificationPurpose;
  /** Overrides the stored locale with the current request's, when known. */
  locale?: string;
}

export interface OtpIssueResult {
  /** Masked, so the response tells the user WHERE without leaking the address. */
  destination: string;
  expiresAt: Date;
  /** The client renders its resend countdown from this (ACC-04). */
  resendAvailableAt: Date;
  attemptsAllowed: number;
}

export interface VerifyOtpInput {
  userId: string;
  purpose: VerificationPurpose;
  code: string;
}

/**
 * One-time codes (ACC-04).
 *
 * Delivery goes through the NotificationDispatcher and NOTHING here knows which
 * channel is used. Email (or the console backend) carries codes at launch; when
 * NOTIFICATIONS_SMS_ENABLED flips, the exact same call starts sending SMS,
 * because the dispatcher — not this service — resolves channels. There is no
 * reference to any provider in this file, which is the property PROMPT 12 asks
 * for: "switching to SMS later needs no code change here".
 *
 * Codes are stored as keyed digests, never in the clear, and every guess is
 * counted, so a 6-digit space stays defensible.
 */
@Injectable()
export class OtpService {
  private readonly config: OtpConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcher,
    // @Optional() is load-bearing, not decoration. `OtpConfig` is an interface,
    // so `emitDecoratorMetadata` erases it to `Object` and Nest tries to resolve
    // a provider for it — which fails at bootstrap and takes the whole API down.
    // The parameter exists so tests can inject a config; @Optional() is what
    // lets the container skip it in production.
    @Optional() config?: OtpConfig,
  ) {
    this.config = config ?? getOtpConfig();
  }

  /**
   * Issues a code and hands it to the dispatcher. Enforces both a per-send
   * cooldown (the countdown) and a rolling window cap, so "resend" cannot be
   * turned into a free notification cannon aimed at someone else's inbox.
   */
  async issue(input: IssueOtpInput): Promise<OtpIssueResult> {
    const start = Date.now();
    const now = new Date();

    const user = await this.prisma.client.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, phone: true, locale: true },
    });

    if (!user) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'We could not find that account.',
      );
    }

    // Email first at launch (it is the channel that actually delivers), phone as
    // the binding target once SMS is live. The dispatcher still makes the final
    // channel decision — this value only records what the code was issued against.
    const destination = user.email ?? user.phone;
    if (!destination) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'NO_DESTINATION',
        'Add a phone number or email address before requesting a code.',
      );
    }

    await this.assertNotThrottled(input.userId, input.purpose, now);

    const code = generateNumericCode(this.config.length);
    const expiresAt = new Date(now.getTime() + this.config.ttlMs);

    // Retire every earlier live code for this purpose, so only the newest one
    // works. Otherwise each resend would widen the guessable surface.
    const record = await this.prisma.client.$transaction(async (tx) => {
      await tx.verificationCode.updateMany({
        where: {
          userId: input.userId,
          purpose: input.purpose,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { expiresAt: now },
      });

      return tx.verificationCode.create({
        data: {
          userId: input.userId,
          purpose: input.purpose,
          destination,
          codeHash: hashSecret(code),
          expiresAt,
        },
        select: { id: true, createdAt: true },
      });
    });

    // Awaited rather than emitted: the user is staring at a "code sent" screen,
    // so an undeliverable code must fail the request instead of disappearing into
    // a fire-and-forget listener. Emitting stays the rule for notices nobody is
    // blocking on; this is the deliberate exception, and it still goes through
    // the dispatcher rather than touching a provider.
    const deliveries = await this.dispatcher.dispatch(
      new NotificationRequestedEvent({
        userId: input.userId,
        templateKey: 'auth.otp_code',
        variables: {
          code,
          expiresInMinutes: Math.round(this.config.ttlMs / 60_000),
        },
        locale: input.locale ?? user.locale,
        requestId: getRequestId(),
        metadata: { purpose: input.purpose },
      }),
    );

    if (deliveries.length === 0) {
      // No channel could reach them. Roll the code back so the throttle window is
      // not consumed by a send that never happened.
      await this.prisma.client.verificationCode.delete({ where: { id: record.id } });

      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'OTP_UNDELIVERABLE',
        'We could not send your code. Add an email address to your account and try again.',
      );
    }

    logger.info('OTP issued', {
      durationMs: Date.now() - start,
      result: { userId: input.userId, purpose: input.purpose, channels: deliveries.length },
    });

    return {
      destination: maskDestination(destination),
      expiresAt,
      resendAvailableAt: new Date(record.createdAt.getTime() + this.config.resendCooldownMs),
      attemptsAllowed: this.config.maxAttempts,
    };
  }

  /**
   * Verifies and CONSUMES a code. Returns the consumed record so callers can act
   * on what was actually proven (e.g. which destination was verified).
   */
  async verify(input: VerifyOtpInput): Promise<{ destination: string }> {
    const now = new Date();

    const record = await this.prisma.client.verificationCode.findFirst({
      where: { userId: input.userId, purpose: input.purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        codeHash: true,
        destination: true,
        expiresAt: true,
        attempts: true,
      },
    });

    if (!record) {
      throw this.invalidCode();
    }

    if (record.expiresAt <= now) {
      throw new AppException(
        HttpStatus.GONE,
        'CODE_EXPIRED',
        'That code has expired. Request a new one.',
      );
    }

    if (record.attempts >= this.config.maxAttempts) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'TOO_MANY_ATTEMPTS',
        'Too many incorrect attempts. Request a new code.',
      );
    }

    if (!secretHashEquals(record.codeHash, hashSecret(input.code))) {
      const { attempts } = await this.prisma.client.verificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });

      const remaining = Math.max(this.config.maxAttempts - attempts, 0);

      logger.warn('OTP verification failed', {
        payload: { userId: input.userId, purpose: input.purpose, attemptsRemaining: remaining },
      });

      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_CODE',
        remaining > 0
          ? `That code is not correct. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
          : 'That code is not correct. Request a new one.',
        { code: ['Check the code and try again.'] },
      );
    }

    // Conditional update: `consumedAt: null` in the WHERE makes consumption atomic,
    // so two racing requests with the same correct code cannot both succeed.
    const consumed = await this.prisma.client.verificationCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: now },
    });

    if (consumed.count === 0) {
      throw this.invalidCode();
    }

    logger.info('OTP verified', {
      result: { userId: input.userId, purpose: input.purpose },
    });

    return { destination: record.destination };
  }

  /**
   * Cooldown + rolling window. Both are expressed as a 429 carrying
   * `retryAfterSeconds` so the client can drive an accurate countdown rather than
   * guessing (ACC-04: "resend with countdown").
   */
  private async assertNotThrottled(
    userId: string,
    purpose: VerificationPurpose,
    now: Date,
  ): Promise<void> {
    const windowStart = new Date(now.getTime() - this.config.windowMs);

    const recent = await this.prisma.client.verificationCode.findMany({
      where: { userId, purpose, createdAt: { gte: windowStart } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const latest = recent[0];
    if (latest) {
      const readyAt = latest.createdAt.getTime() + this.config.resendCooldownMs;
      if (readyAt > now.getTime()) {
        throw this.throttled(Math.ceil((readyAt - now.getTime()) / 1000), 'RESEND_TOO_SOON');
      }
    }

    const oldest = recent[recent.length - 1];
    if (recent.length >= this.config.maxPerWindow && oldest) {
      // The window frees up when the OLDEST code in it ages out.
      const readyAt = oldest.createdAt.getTime() + this.config.windowMs;
      throw this.throttled(
        Math.max(Math.ceil((readyAt - now.getTime()) / 1000), 1),
        'TOO_MANY_CODES',
      );
    }
  }

  private throttled(retryAfterSeconds: number, code: 'RESEND_TOO_SOON' | 'TOO_MANY_CODES') {
    const message =
      code === 'RESEND_TOO_SOON'
        ? `Wait ${retryAfterSeconds}s before requesting another code.`
        : 'You have requested too many codes. Try again later.';

    return new AppException(HttpStatus.TOO_MANY_REQUESTS, code, message, {
      retryAfterSeconds: [String(retryAfterSeconds)],
    });
  }

  private invalidCode() {
    // Deliberately identical to a wrong-code response: "no code exists" and "code
    // is wrong" must be indistinguishable, or the endpoint reveals account state.
    return new AppException(
      HttpStatus.BAD_REQUEST,
      'INVALID_CODE',
      'That code is not correct. Request a new one.',
      { code: ['Check the code and try again.'] },
    );
  }
}
