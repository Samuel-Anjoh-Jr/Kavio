import { Role, UserStatus, VerificationTier } from '@kavio/database';
import { AppException } from '../lib/app-exception';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { SessionService } from './session.service';
import type { TokenService } from './token.service';

// SessionService.refresh() hashes the presented refresh token (secret-hash.util)
// before looking it up, same as profile.service.spec.ts and otp.service.spec.ts.
process.env.AUTH_SECRET_PEPPER = 'test-pepper';

/**
 * The single-flight refresh-rotation race (ACC-05): a background session poll
 * and a page render can both wake on the identical, already-rotated cookie a
 * moment apart. The lock only protects a caller that overlaps with the
 * ORIGINAL winner while it still holds the lock; a caller arriving just after
 * that winner already finished and released it would otherwise walk straight
 * into `rotate()` and be mistaken for a stolen, replayed token — a real,
 * reproduced bug (a live 16-minute single-tab session was silently signed
 * out by exactly this race). `refresh()` must answer that late duplicate from
 * the still-warm result cache instead, while still catching a GENUINE replay
 * that has no such cached result to fall back on.
 */
describe('SessionService.refresh', () => {
  const USER_ID = 'user-1';
  const FAMILY_ID = 'family-1';
  const RAW_TOKEN = 'raw-refresh-token';

  function makeHarness({ rotatedAt }: { rotatedAt: Date | null }) {
    const redisStore = new Map<string, string>();
    const redis = {
      client: {
        get: jest.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
        set: jest.fn((key: string, value: string, ...rest: unknown[]) => {
          if (rest.includes('NX') && redisStore.has(key)) return Promise.resolve(null);
          redisStore.set(key, value);
          return Promise.resolve('OK');
        }),
        del: jest.fn((key: string) => {
          redisStore.delete(key);
          return Promise.resolve();
        }),
      },
    } as unknown as RedisService;

    const stored = {
      id: 'rt-1',
      userId: USER_ID,
      familyId: FAMILY_ID,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      rotatedAt,
      revokedAt: null,
      createdAt: new Date(Date.now() - 1000),
    };

    const prisma = {
      client: {
        refreshToken: {
          findUnique: jest.fn().mockResolvedValue(stored),
          update: jest.fn().mockResolvedValue(stored),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue({}),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: USER_ID,
            status: UserStatus.ACTIVE,
            tier: VerificationTier.TIER_1,
            roles: [{ role: Role.CLIENT, isActive: true }],
          }),
        },
        $transaction: jest.fn((arg: unknown) =>
          typeof arg === 'function'
            ? (arg as (tx: unknown) => unknown)({})
            : Promise.all(arg as []),
        ),
      },
    } as unknown as PrismaService;

    const tokens = {
      verifyRefreshToken: jest.fn().mockReturnValue({ sub: USER_ID, sid: FAMILY_ID, jti: 'jti-1' }),
      signAccessToken: jest.fn().mockReturnValue({ token: 'access-token', expiresAt: new Date() }),
      signRefreshToken: jest
        .fn()
        .mockReturnValue({ token: 'new-refresh-token', expiresAt: new Date() }),
      accessTtlSeconds: 900,
    } as unknown as TokenService;

    return { service: new SessionService(prisma, tokens, redis), prisma };
  }

  it('answers a late duplicate of an already-rotated token from cache, without revoking the family', async () => {
    // Not yet rotated when the FIRST call runs — that call is the legitimate
    // winner, and it is what marks the token rotated for real.
    const { service, prisma } = makeHarness({ rotatedAt: null });

    const first = await service.refresh(RAW_TOKEN);
    expect(prisma.client.refreshToken.findUnique).toHaveBeenCalledTimes(1);

    // A second, later presentation of the IDENTICAL raw token — the race this
    // fix closes. It must be answered from the cached result alone: no second
    // trip to `rotate()`, so no second `findUnique` and no family revocation.
    const second = await service.refresh(RAW_TOKEN);

    expect(second).toEqual(first);
    expect(prisma.client.refreshToken.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.client.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('still detects and revokes a genuinely stale token with no cached result to fall back on', async () => {
    // Already rotated in the DB, and nothing in the result cache to explain
    // why — a real replay of a token that leaked, not a same-process echo.
    const { service, prisma } = makeHarness({ rotatedAt: new Date() });

    await expect(service.refresh(RAW_TOKEN)).rejects.toBeInstanceOf(AppException);
    expect(prisma.client.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: FAMILY_ID, revokedAt: null } }),
    );
  });
});
