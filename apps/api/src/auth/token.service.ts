import { Injectable, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role, UserStatus, VerificationTier } from '@trustpro/database';
import { getJwtConfig, type JwtConfig } from './auth.config';

/**
 * JWT issuing and verification (ACC-05).
 *
 * The ACCESS token is fully stateless: every claim a guard needs to authorise a
 * request is inside it, so a normal request never touches the database for auth.
 * That is the whole point of the design — and the reason it is short-lived.
 *
 * The REFRESH token is also a JWT, but its `jti` is additionally tracked in the
 * RefreshToken table. Statelessness is a property you want on the hot path, not
 * on a once-per-15-minutes call where logout, rotation and leak-detection matter
 * far more (see SessionService).
 */

export type TokenType = 'access' | 'refresh';

/** Everything RBAC needs, carried in the token itself. */
export interface AccessTokenClaims {
  sub: string;
  typ: 'access';
  /** The role the user is currently acting as — what RolesGuard checks (ACC-07). */
  activeRole: Role;
  /** Every role granted to the identity, so a switch needs no re-authentication. */
  roles: Role[];
  /** Identity-level, never role-level (ACC-06). */
  tier: VerificationTier;
  status: UserStatus;
  /** Session family id, correlating an access token with its refresh lineage. */
  sid: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenClaims {
  sub: string;
  typ: 'refresh';
  /** Rotation lineage. Reuse inside a family means the token leaked. */
  sid: string;
  /** Unique per issued token; its hash is the RefreshToken row's lookup key. */
  jti: string;
  iat: number;
  exp: number;
}

/** Why verification failed — the distinction ACC-09 hangs on. */
export type TokenFailure = 'expired' | 'invalid';

export class TokenVerificationError extends Error {
  constructor(readonly reason: TokenFailure) {
    super(reason === 'expired' ? 'Token expired' : 'Token invalid');
    this.name = 'TokenVerificationError';
  }
}

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  private readonly config: JwtConfig;

  constructor(
    private readonly jwt: JwtService,
    // See OtpService: an interface parameter erases to `Object`, which Nest
    // then tries (and fails) to resolve at bootstrap.
    @Optional() config?: JwtConfig,
  ) {
    this.config = config ?? getJwtConfig();
  }

  get accessTtlSeconds(): number {
    return this.config.accessTtlSeconds;
  }

  get refreshTtlSeconds(): number {
    return this.config.refreshTtlSeconds;
  }

  signAccessToken(claims: Omit<AccessTokenClaims, 'typ' | 'iat' | 'exp'>): IssuedToken {
    const token = this.jwt.sign(
      { ...claims, typ: 'access' satisfies TokenType },
      {
        secret: this.config.accessSecret,
        expiresIn: this.config.accessTtlSeconds,
        issuer: this.config.issuer,
        audience: this.config.audience,
      },
    );

    return {
      token,
      expiresAt: new Date(Date.now() + this.config.accessTtlSeconds * 1000),
    };
  }

  signRefreshToken(claims: Omit<RefreshTokenClaims, 'typ' | 'iat' | 'exp'>): IssuedToken {
    const token = this.jwt.sign(
      { ...claims, typ: 'refresh' satisfies TokenType },
      {
        secret: this.config.refreshSecret,
        expiresIn: this.config.refreshTtlSeconds,
        issuer: this.config.issuer,
        audience: this.config.audience,
      },
    );

    return {
      token,
      expiresAt: new Date(Date.now() + this.config.refreshTtlSeconds * 1000),
    };
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    return this.verify<AccessTokenClaims>(token, this.config.accessSecret, 'access');
  }

  verifyRefreshToken(token: string): RefreshTokenClaims {
    return this.verify<RefreshTokenClaims>(token, this.config.refreshSecret, 'refresh');
  }

  /**
   * Verifies signature, issuer, audience and expiry, then asserts the token TYPE.
   * The type check is what stops a refresh token being presented as a bearer
   * access token (they are signed with different secrets, but asserting the claim
   * keeps that guarantee explicit rather than incidental).
   */
  private verify<T extends { typ: TokenType }>(
    token: string,
    secret: string,
    expected: TokenType,
  ): T {
    let payload: T;

    try {
      payload = this.jwt.verify<T>(token, {
        secret,
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      // Only a genuine TokenExpiredError may surface as "expired" — every other
      // failure is "invalid", so the client never shows "Session expired" for a
      // tampered or malformed token (ACC-09).
      throw new TokenVerificationError(name === 'TokenExpiredError' ? 'expired' : 'invalid');
    }

    if (payload?.typ !== expected) {
      throw new TokenVerificationError('invalid');
    }

    return payload;
  }
}
