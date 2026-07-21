import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus, VerificationTier } from '@trustpro/database';
import { AppException } from '../../lib/app-exception';
import type { JwtConfig } from '../auth.config';
import type { AuthenticatedUser } from '../auth.types';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, ROLES_KEY } from '../decorators/auth.decorators';
import { TokenService } from '../token.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

const CONFIG: JwtConfig = {
  accessSecret: 'access-secret-for-tests',
  refreshSecret: 'refresh-secret-for-tests',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 2_592_000,
  issuer: 'trustpro',
  audience: 'trustpro-web',
};

const tokens = new TokenService(new JwtService(), CONFIG);

function accessToken(overrides: Partial<Parameters<typeof tokens.signAccessToken>[0]> = {}) {
  return tokens.signAccessToken({
    sub: 'user-1',
    activeRole: Role.WORKER,
    roles: [Role.WORKER],
    tier: VerificationTier.TIER_1,
    status: UserStatus.ACTIVE,
    sid: 'session-1',
    ...overrides,
  }).token;
}

/** A minimal HTTP ExecutionContext carrying the request the guards mutate. */
function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/** Reflector stub returning whatever metadata a test declares for the route. */
function makeReflector(metadata: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
}

describe('JwtAuthGuard', () => {
  it('rejects an unauthenticated request by default', () => {
    const guard = new JwtAuthGuard(makeReflector({}), tokens);
    const context = makeContext({ headers: {} });

    // Deny by default: a route with no @Public() is protected the moment it exists.
    const error = catchError(() => guard.canActivate(context));
    expect((error as AppException).code).toBe('UNAUTHENTICATED');
    expect((error as AppException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('attaches the identity from a valid bearer token', () => {
    const guard = new JwtAuthGuard(makeReflector({}), tokens);
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${accessToken()}` },
    };

    expect(guard.canActivate(makeContext(request))).toBe(true);

    const user = request.user as AuthenticatedUser;
    expect(user.id).toBe('user-1');
    expect(user.activeRole).toBe(Role.WORKER);
    expect(user.sessionId).toBe('session-1');
  });

  it('says SESSION_EXPIRED only for a token that genuinely aged out', () => {
    const expiredTokens = new TokenService(new JwtService(), { ...CONFIG, accessTtlSeconds: -1 });
    const guard = new JwtAuthGuard(makeReflector({}), tokens);

    const token = expiredTokens.signAccessToken({
      sub: 'user-1',
      activeRole: Role.WORKER,
      roles: [Role.WORKER],
      tier: VerificationTier.TIER_1,
      status: UserStatus.ACTIVE,
      sid: 'session-1',
    }).token;

    const error = catchError(() =>
      guard.canActivate(makeContext({ headers: { authorization: `Bearer ${token}` } })),
    );

    expect((error as AppException).code).toBe('SESSION_EXPIRED');
  });

  it('says INVALID_TOKEN — not expired — for a forged token (ACC-09)', () => {
    const guard = new JwtAuthGuard(makeReflector({}), tokens);

    const error = catchError(() =>
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer not-a-real-token' } })),
    );

    expect((error as AppException).code).toBe('INVALID_TOKEN');
  });

  it('lets a guest through a @Public() route with no token', () => {
    const guard = new JwtAuthGuard(makeReflector({ [IS_PUBLIC_KEY]: true }), tokens);
    const request: Record<string, unknown> = { headers: {} };

    // Guest browsing (ACC-01) depends on this.
    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('still identifies a signed-in user on a @Public() route', () => {
    const guard = new JwtAuthGuard(makeReflector({ [IS_PUBLIC_KEY]: true }), tokens);
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${accessToken()}` },
    };

    guard.canActivate(makeContext(request));

    // So a guest-browsable surface can personalise without a second code path.
    expect((request.user as AuthenticatedUser).id).toBe('user-1');
  });

  it('blocks a suspended account holding an otherwise valid token', () => {
    const guard = new JwtAuthGuard(makeReflector({}), tokens);
    const token = accessToken({ status: UserStatus.SUSPENDED });

    const error = catchError(() =>
      guard.canActivate(makeContext({ headers: { authorization: `Bearer ${token}` } })),
    );

    expect((error as AppException).code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('RolesGuard', () => {
  const worker: AuthenticatedUser = {
    id: 'user-1',
    activeRole: Role.WORKER,
    roles: [Role.WORKER, Role.CLIENT],
    tier: VerificationTier.TIER_1,
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
  };

  it('allows a route that declares no requirement', () => {
    const guard = new RolesGuard(makeReflector({}));
    expect(guard.canActivate(makeContext({ user: worker }))).toBe(true);
  });

  it('allows an action the active role permits', () => {
    const guard = new RolesGuard(makeReflector({ [PERMISSIONS_KEY]: ['job:apply'] }));
    expect(guard.canActivate(makeContext({ user: worker }))).toBe(true);
  });

  it('rejects an action the ACTIVE role does not permit, even when held by another role', () => {
    // The user IS a Client too, but is acting as a Worker right now. Authorisation
    // follows the active role — this is the core ACC-06/ACC-07 guarantee.
    const guard = new RolesGuard(makeReflector({ [PERMISSIONS_KEY]: ['job:create'] }));

    const error = catchError(() => guard.canActivate(makeContext({ user: worker })));

    expect((error as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect((error as AppException).code).toBe('FORBIDDEN_FOR_ROLE');
  });

  it('enforces an explicit role requirement', () => {
    const guard = new RolesGuard(makeReflector({ [ROLES_KEY]: [Role.ADMIN] }));

    const error = catchError(() => guard.canActivate(makeContext({ user: worker })));
    expect((error as AppException).code).toBe('FORBIDDEN_FOR_ROLE');
  });

  it('fails closed when no user reached it', () => {
    // Should be unreachable (JwtAuthGuard runs first), but a guard-ordering
    // mistake must never silently authorise a request.
    const guard = new RolesGuard(makeReflector({ [PERMISSIONS_KEY]: ['job:apply'] }));

    const error = catchError(() => guard.canActivate(makeContext({})));
    expect((error as AppException).code).toBe('UNAUTHENTICATED');
  });
});

function catchError(fn: () => unknown): unknown {
  try {
    fn();
    throw new Error('expected the call to throw');
  } catch (error) {
    return error;
  }
}
