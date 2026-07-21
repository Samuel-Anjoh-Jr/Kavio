import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { hashPassword, verifyPassword } from '../lib/password.util';
import { generateOpaqueToken, hashSecret } from '../lib/secret-hash.util';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import { getAppBaseUrl } from '../notifications/notification.config';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { getPasswordResetConfig, type PasswordResetConfig } from './auth.config';
import type { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import { identifierWhere, resolveIdentifier } from './identifier.util';
import { SessionService } from './session.service';

const logger = createLogger('auth:password');

/**
 * Password reset and change (ACC-08).
 *
 * The reset link is delivered through the NotificationDispatcher like every other
 * message — this service never names a channel or a provider, so reset emails
 * become reset SMS the day the flag flips, with no change here.
 *
 * A completed reset revokes EVERY session. If the reset was triggered because the
 * account was compromised, leaving the attacker's refresh token alive would make
 * the whole exercise pointless.
 */
@Injectable()
export class PasswordService {
  private readonly config: PasswordResetConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly sessions: SessionService,
    private readonly events: EventEmitter2,
    // See OtpService: an interface parameter erases to `Object`, which Nest
    // then tries (and fails) to resolve at bootstrap. @Optional() keeps the
    // test-injectable config without breaking the container.
    @Optional() config?: PasswordResetConfig,
  ) {
    this.config = config ?? getPasswordResetConfig();
  }

  /**
   * Starts a reset. ALWAYS reports success: "no account with that email" is the
   * single most useful sentence you can give someone enumerating a user base.
   */
  async forgotPassword(dto: ForgotPasswordDto, locale?: string): Promise<{ sent: true }> {
    const identifier = resolveIdentifier(dto.identifier);

    if (!identifier) {
      return { sent: true };
    }

    const user = await this.prisma.client.user.findUnique({
      where: identifierWhere(identifier),
      select: { id: true, locale: true },
    });

    if (!user) {
      logger.info('Password reset requested for unknown identifier', {
        result: { kind: identifier.kind },
      });
      return { sent: true };
    }

    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.ttlMs);

    // Any earlier live token is burned, so a reset link mailed yesterday cannot
    // be used after the user has asked for a fresh one.
    await this.prisma.client.$transaction([
      this.prisma.client.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.client.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashSecret(token), expiresAt },
      }),
    ]);

    const resetUrl = `${getAppBaseUrl()}${this.config.resetPath}?token=${encodeURIComponent(token)}`;

    await this.dispatcher.dispatch(
      new NotificationRequestedEvent({
        userId: user.id,
        templateKey: 'auth.password_reset',
        variables: {
          resetUrl,
          expiresInMinutes: Math.round(this.config.ttlMs / 60_000),
        },
        locale: locale ?? user.locale,
        requestId: getRequestId(),
      }),
    );

    logger.info('Password reset dispatched', { result: { userId: user.id } });

    return { sent: true };
  }

  /** Consumes a reset token and sets the new password. */
  async resetPassword(dto: ResetPasswordDto): Promise<{ reset: true }> {
    const now = new Date();

    const record = await this.prisma.client.passwordResetToken.findUnique({
      where: { tokenHash: hashSecret(dto.token) },
      select: { id: true, userId: true, expiresAt: true, consumedAt: true },
    });

    if (!record || record.consumedAt || record.expiresAt <= now) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'RESET_TOKEN_INVALID',
        'This reset link is no longer valid. Request a new one.',
      );
    }

    const passwordHash = await hashPassword(dto.password);

    // Conditional consume inside the transaction: `consumedAt: null` in the WHERE
    // makes a double-submit impossible to satisfy twice.
    const consumed = await this.prisma.client.passwordResetToken.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: now },
    });

    if (consumed.count === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'RESET_TOKEN_INVALID',
        'This reset link is no longer valid. Request a new one.',
      );
    }

    await this.prisma.client.user.update({
      where: { id: record.userId },
      data: { passwordHash, passwordUpdatedAt: now },
    });

    // Every existing session dies with the old password.
    await this.sessions.revokeAllForUser(record.userId);

    logger.info('Password reset completed', { result: { userId: record.userId } });

    this.emitPasswordChanged(record.userId);

    return { reset: true };
  }

  /** Changes the password for a signed-in user, confirming the current one. */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ changed: true }> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user?.passwordHash) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PASSWORD_NOT_SET',
        'Use the reset link to set your first password.',
      );
    }

    if (!(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'That password is not correct.',
        { currentPassword: ['Check your current password and try again.'] },
      );
    }

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(dto.newPassword),
        passwordUpdatedAt: new Date(),
      },
    });

    await this.sessions.revokeAllForUser(userId);

    logger.info('Password changed', { result: { userId } });

    this.emitPasswordChanged(userId);

    return { changed: true };
  }

  /**
   * Fire-and-forget, unlike the reset link itself: the user is not waiting on
   * this notice, so it goes through the event bus per the dispatcher pattern.
   */
  private emitPasswordChanged(userId: string): void {
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId,
        templateKey: 'auth.password_changed',
        variables: { occurredAt: new Date().toISOString() },
        requestId: getRequestId(),
      }),
    );
  }
}
