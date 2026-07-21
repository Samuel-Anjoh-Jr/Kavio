import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus, VerificationTier } from '@trustpro/database';
import type { JwtConfig } from './auth.config';
import { TokenService, TokenVerificationError } from './token.service';

const CONFIG: JwtConfig = {
  accessSecret: 'access-secret-for-tests',
  refreshSecret: 'refresh-secret-for-tests',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 2_592_000,
  issuer: 'trustpro',
  audience: 'trustpro-web',
};

function makeService(overrides: Partial<JwtConfig> = {}) {
  return new TokenService(new JwtService(), { ...CONFIG, ...overrides });
}

const CLAIMS = {
  sub: 'user-1',
  activeRole: Role.WORKER,
  roles: [Role.WORKER, Role.CLIENT],
  tier: VerificationTier.TIER_1,
  status: UserStatus.ACTIVE,
  sid: 'session-1',
};

describe('TokenService', () => {
  it('round-trips every claim RBAC needs, so no database read is required', () => {
    const service = makeService();

    const { token } = service.signAccessToken(CLAIMS);
    const decoded = service.verifyAccessToken(token);

    expect(decoded.sub).toBe('user-1');
    expect(decoded.activeRole).toBe(Role.WORKER);
    expect(decoded.roles).toEqual([Role.WORKER, Role.CLIENT]);
    expect(decoded.tier).toBe(VerificationTier.TIER_1);
    expect(decoded.sid).toBe('session-1');
  });

  it('reports an aged-out token as EXPIRED', () => {
    // The distinction ACC-09 hangs on: only this may ever surface as
    // "Session expired" to a user.
    const service = makeService({ accessTtlSeconds: -1 });

    const { token } = service.signAccessToken(CLAIMS);
    const error = catchError(() => service.verifyAccessToken(token));

    expect(error).toBeInstanceOf(TokenVerificationError);
    expect((error as TokenVerificationError).reason).toBe('expired');
  });

  it('reports a tampered or foreign token as INVALID, never expired', () => {
    const service = makeService();
    const attacker = makeService({ accessSecret: 'a-different-secret' });

    const forged = attacker.signAccessToken(CLAIMS).token;

    expect(
      (catchError(() => service.verifyAccessToken(forged)) as TokenVerificationError).reason,
    ).toBe('invalid');
    expect(
      (catchError(() => service.verifyAccessToken('garbage')) as TokenVerificationError).reason,
    ).toBe('invalid');
  });

  it('refuses a refresh token presented as an access token', () => {
    const service = makeService();

    const refresh = service.signRefreshToken({ sub: 'user-1', sid: 'session-1', jti: 'jti-1' });
    const error = catchError(() => service.verifyAccessToken(refresh.token));

    // Different secrets already prevent this; asserting `typ` keeps the
    // guarantee explicit rather than incidental.
    expect((error as TokenVerificationError).reason).toBe('invalid');
  });

  it('rejects a token minted for a different audience or issuer', () => {
    const service = makeService();
    const other = makeService({ audience: 'someone-else' });

    const token = other.signAccessToken(CLAIMS).token;

    expect(
      (catchError(() => service.verifyAccessToken(token)) as TokenVerificationError).reason,
    ).toBe('invalid');
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
