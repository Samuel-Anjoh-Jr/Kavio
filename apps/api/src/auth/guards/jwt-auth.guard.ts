import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '@kavio/database';
import { AppException } from '../../lib/app-exception';
import type { AuthenticatedUser } from '../auth.types';
import { getRequestFromContext, IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { TokenService, TokenVerificationError } from '../token.service';

/**
 * Authentication guard, registered globally (deny by default). Routes marked
 * @Public() are skipped — which is how the guest first-interface stays fully
 * browsable with no account (ACC-01) while every other route is protected.
 *
 * Verification is pure signature + claims work, so an authenticated request costs
 * no database round-trip. That is what "stateless JWT" buys (ACC-05).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = getRequestFromContext(context);
    const token = extractBearerToken(request?.headers);

    if (isPublic) {
      // A public route still attaches the user when a valid token is present, so
      // guest-browsable surfaces can personalise without a second code path.
      if (token) {
        try {
          request.user = toAuthenticatedUser(this.tokens.verifyAccessToken(token));
        } catch {
          // A bad token on a public route is simply an anonymous visitor.
        }
      }
      return true;
    }

    if (!token) {
      // Deliberately NOT "session expired": no credential was presented at all,
      // and conflating the two is exactly what ACC-09 forbids.
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Sign in to continue.');
    }

    let claims;
    try {
      claims = this.tokens.verifyAccessToken(token);
    } catch (error) {
      if (error instanceof TokenVerificationError && error.reason === 'expired') {
        // The ONLY path that may say "session expired" — a token that verified
        // correctly and simply aged out. The client refreshes on this code.
        throw new AppException(
          HttpStatus.UNAUTHORIZED,
          'SESSION_EXPIRED',
          'Your session expired. Sign in again.',
        );
      }
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_TOKEN',
        'Your sign-in could not be verified. Sign in again.',
      );
    }

    const user = toAuthenticatedUser(claims);

    // A suspended identity holds a technically valid token until it expires;
    // status is re-checked here so suspension takes effect within the access TTL.
    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DELETED) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_SUSPENDED',
        'This account is not active. Contact support.',
      );
    }

    request.user = user;
    return true;
  }
}

/** Reads `Authorization: Bearer <token>`, case-insensitively on the scheme. */
export function extractBearerToken(headers: Record<string, unknown> | undefined): string | null {
  const raw = headers?.authorization ?? headers?.Authorization;
  if (typeof raw !== 'string') {
    return null;
  }

  const [scheme, token] = raw.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token.trim() || null;
}

function toAuthenticatedUser(claims: {
  sub: string;
  activeRole: AuthenticatedUser['activeRole'];
  roles: AuthenticatedUser['roles'];
  tier: AuthenticatedUser['tier'];
  status: AuthenticatedUser['status'];
  sid: string;
}): AuthenticatedUser {
  return {
    id: claims.sub,
    activeRole: claims.activeRole,
    roles: claims.roles ?? [],
    tier: claims.tier,
    status: claims.status,
    sessionId: claims.sid,
  };
}
