import { VerificationTier } from '@trustpro/database';
import { AppException } from '../lib/app-exception';
import type { PrismaService } from '../prisma/prisma.service';
import { MAX_NEARBY_LIMIT, MAX_RADIUS_M } from './geo.config';
import { ProximityService } from './proximity.service';

const AKWA = { latitude: 4.0503, longitude: 9.7 };

const row = (overrides: Record<string, unknown> = {}) => ({
  worker_profile_id: 'profile-1',
  user_id: 'user-1',
  name: 'Awa N.',
  avatar: null,
  headline: 'Plumber',
  city: 'Douala',
  area: 'Akwa',
  landmark: 'Behind the pharmacy',
  region_slug: 'douala-akwa',
  region_name_en: 'Akwa',
  region_name_fr: 'Akwa',
  tier: VerificationTier.TIER_2,
  trust_score: 72,
  completed_jobs: 14,
  // Postgres NUMERIC arrives as a Decimal-like object, not a JS number.
  average_rating: { toString: () => '4.75' },
  latitude: 4.0505,
  longitude: 9.7002,
  distance_m: 812.4917,
  total_count: 3n,
  ...overrides,
});

function makeHarness(rows: unknown[]) {
  const queryRaw = jest.fn().mockResolvedValue(rows);
  const prisma = { client: { $queryRaw: queryRaw } } as unknown as PrismaService;

  /**
   * The bound parameters of the first query. Prisma's tagged template passes
   * the strings array first, so the values start at index 1.
   */
  const boundParameters = (): unknown[] => {
    const calls = queryRaw.mock.calls as unknown as unknown[][];
    return (calls[0] ?? []).slice(1).flat();
  };

  return { service: new ProximityService(prisma), queryRaw, boundParameters };
}

describe('ProximityService.nearbyWorkers', () => {
  it('maps SQL rows into the API shape', async () => {
    const { service } = makeHarness([row()]);

    const result = await service.nearbyWorkers({ ...AKWA });

    expect(result.workers).toHaveLength(1);
    expect(result.workers[0]).toMatchObject({
      workerProfileId: 'profile-1',
      userId: 'user-1',
      tier: VerificationTier.TIER_2,
      trustScore: 72,
      regionSlug: 'douala-akwa',
    });
  });

  it('rounds distance to whole metres', async () => {
    const { service } = makeHarness([row()]);

    const result = await service.nearbyWorkers({ ...AKWA });

    // Sub-metre precision on a GPS fix that is tens of metres out is false
    // confidence, and it makes the number longer to read on a phone.
    expect(result.workers[0]?.distanceM).toBe(812);
  });

  it('converts NUMERIC ratings and BIGINT counts into JS numbers', async () => {
    const { service } = makeHarness([row()]);

    const result = await service.nearbyWorkers({ ...AKWA });

    expect(result.workers[0]?.averageRating).toBe(4.75);
    expect(result.totalCount).toBe(3);
    expect(typeof result.totalCount).toBe('number');
  });

  it('keeps a null rating null rather than turning it into zero', async () => {
    // A worker who has never been rated has no rating. Zero would read as
    // "rated, badly" and rank them as if the market had judged them.
    const { service } = makeHarness([row({ average_rating: null })]);

    const result = await service.nearbyWorkers({ ...AKWA });

    expect(result.workers[0]?.averageRating).toBeNull();
  });

  describe('the no-provider signal (DIS-06)', () => {
    it('flags an empty first page so the UI can say so kindly', async () => {
      const { service } = makeHarness([]);

      const result = await service.nearbyWorkers({ ...AKWA });

      expect(result.totalCount).toBe(0);
      expect(result.noProvidersInArea).toBe(true);
    });

    it('does not flag an empty page five — that is the end of a list, not an empty area', async () => {
      const { service } = makeHarness([]);

      const result = await service.nearbyWorkers({ ...AKWA, offset: 80 });

      expect(result.noProvidersInArea).toBe(false);
    });

    it('is false whenever anyone was found', async () => {
      const { service } = makeHarness([row()]);

      const result = await service.nearbyWorkers({ ...AKWA });

      expect(result.noProvidersInArea).toBe(false);
    });
  });

  describe('input handling', () => {
    it('rejects invalid coordinates before querying', async () => {
      const { service, queryRaw } = makeHarness([]);

      await expect(service.nearbyWorkers({ latitude: 99, longitude: 9.7 })).rejects.toThrow(
        AppException,
      );

      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('reports the radius it actually used, not the one that was asked for', async () => {
      const { service } = makeHarness([]);

      const result = await service.nearbyWorkers({ ...AKWA, radiusM: 10_000_000 });

      // The client renders "within X km" from this, so returning the request
      // rather than the clamp would draw a circle the search never ran.
      expect(result.radiusM).toBe(MAX_RADIUS_M);
    });

    it('clamps an oversized page rather than refusing it', async () => {
      const { service, boundParameters } = makeHarness([]);

      await service.nearbyWorkers({ ...AKWA, limit: 5000 });

      // The clamped value is what reaches SQL — clamping in the response shape
      // alone would still let one request scan the whole table.
      expect(boundParameters()).toContain(MAX_NEARBY_LIMIT);
    });

    it('floors a negative minimum trust score to zero', async () => {
      const { service, boundParameters } = makeHarness([]);

      await service.nearbyWorkers({ ...AKWA, minTrustScore: -50 });

      expect(boundParameters()).toContain(0);
      expect(boundParameters()).not.toContain(-50);
    });
  });
});
