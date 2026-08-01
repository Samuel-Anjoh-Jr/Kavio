import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Role, UserStatus, type VerificationTier } from '@kavio/database';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { hashSecret } from '../lib/secret-hash.util';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
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
 * A refresh token is single-use, but the client legitimately calls it more than
 * once for the same expiry: Next.js middleware and an RSC render can both hit
 * `jwt()` for one navigation, or two open tabs read the session moments apart.
 * Each of those presents the IDENTICAL, still-valid refresh token. Without
 * coordination, whichever request loses the race would find the token already
 * rotated and get its whole session family revoked as a suspected theft — a
 * self-inflicted logout, not a security event.
 *
 * These keys make rotation single-flight across the whole fleet (not just one
 * process): the first request to touch a given token wins the lock, performs
 * the one real rotation, and caches its result; every other concurrent request
 * for that same token waits briefly and hands back the identical result
 * instead of racing its own rotation.
 */
const REFRESH_LOCK_TTL_MS = 5_000;
const REFRESH_RESULT_TTL_MS = 20_000;
const REFRESH_LOCK_WAIT_ATTEMPTS = 10;
const REFRESH_LOCK_WAIT_INTERVAL_MS = 300;

function refreshLockKey(tokenHash: string): string {
  return `auth:refresh:lock:${tokenHash}`;
}

function refreshResultKey(tokenHash: string): string {
  return `auth:refresh:result:${tokenHash}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    private readonly redis: RedisService,
  ) {}

  /** Starts a brand-new session family (login, OTP verification, 2FA completion). */
  async createSession(userId: string, userAgent?: string): Promise<SessionTokens> {
    const user = await this.loadUser(userId);
    return this.issuePair(user, randomUUID(), userAgent);
  }

  /**
   * Rotates a refresh token. Anything suspicious ends the family rather than
   * merely refusing this one call — but see the single-flight lock below for
   * what "suspicious" deliberately excludes.
   */
  async refresh(refreshToken: string, userAgent?: string): Promise<SessionTokens> {
    let claims;
    try {
      claims = this.tokens.verifyRefreshToken(refreshToken);
    } catch (error) {
      throw sessionError(error);
    }

    const tokenHash = hashSecret(refreshToken);
    const lockKey = refreshLockKey(tokenHash);
    const resultKey = refreshResultKey(tokenHash);

    // `SET NX` is the mutex: exactly one concurrent caller for this exact token
    // gets 'OK' and does the real work below. Everyone else — another tab,
    // middleware racing an RSC render, a retried request — waits for that
    // winner's cached result rather than presenting the same token to the
    // rotation logic itself, which would find it already rotated and revoke
    // the whole family out from under a perfectly legitimate client.
    const acquired = await this.redis.client.set(lockKey, '1', 'PX', REFRESH_LOCK_TTL_MS, 'NX');

    if (acquired !== 'OK') {
      return this.awaitPeerResult(resultKey);
    }

    try {
      const result = await this.rotate(tokenHash, claims.sid, userAgent);
      await this.redis.client.set(resultKey, JSON.stringify(result), 'PX', REFRESH_RESULT_TTL_MS);
      return result;
    } finally {
      await this.redis.client.del(lockKey);
    }
  }

  /** The actual single-use rotation, run by whichever caller won the lock. */
  private async rotate(tokenHash: string, sid: string, userAgent?: string): Promise<SessionTokens> {
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
      // The single-flight lock rules out the benign "my own concurrent
      // request got here first" case — a rotated-or-revoked token reaching
      // this point was genuinely presented twice, which only happens if it
      // leaked.
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

      return this.issuePair(user, sid ?? stored.familyId, userAgent);
    });
  }

  /**
   * Waits for the lock's winner to publish its result, then hands back the
   * identical token pair. Every peer that lost the race ends up here instead
   * of touching the database itself.
   */
  private async awaitPeerResult(resultKey: string): Promise<SessionTokens> {
    for (let attempt = 0; attempt < REFRESH_LOCK_WAIT_ATTEMPTS; attempt += 1) {
      const cached = await this.redis.client.get(resultKey);
      if (cached) {
        return JSON.parse(cached) as SessionTokens;
      }
      await sleep(REFRESH_LOCK_WAIT_INTERVAL_MS);
    }

    // The winner never published a result in time (it crashed, or is simply
    // slow) — the caller can retry, but making it up would be worse than
    // asking it to sign in again.
    throw this.expired();
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
