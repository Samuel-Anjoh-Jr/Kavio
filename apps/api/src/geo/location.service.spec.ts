import { LocationSource, Role, UserStatus, VerificationTier } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import type { PrismaService } from '../prisma/prisma.service';
import { LocationService } from './location.service';
import type { ResolvedPlace, ReverseGeocodeService } from './reverse-geocode.service';

const AKWA = { latitude: 4.0503, longitude: 9.7 };
const BONABERI = { latitude: 4.08, longitude: 9.667 };

const PLACE: ResolvedPlace = {
  regionId: 'region-akwa',
  regionSlug: 'douala-akwa',
  regionLevel: 'NEIGHBOURHOOD',
  locality: 'Akwa',
  city: 'Douala',
  principalSubdivision: 'Littoral',
  countryCode: 'CM',
  source: 'postgis',
};

const user = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'user-1',
  activeRole: Role.WORKER,
  roles: [Role.WORKER],
  tier: VerificationTier.TIER_0,
  status: UserStatus.ACTIVE,
  sessionId: 'session-1',
  ...overrides,
});

/** The shape Prisma's `update` is called with, so assertions stay typed. */
interface UpdateCall {
  where: { id: string };
  data: Record<string, unknown>;
}

function makeHarness(existingProfile: Record<string, unknown> | null) {
  const update = jest.fn().mockResolvedValue({});
  const findUnique = jest.fn().mockResolvedValue(existingProfile);

  const prisma = {
    client: {
      workerProfile: { findUnique, update },
      clientProfile: { findUnique, update },
      businessProfile: { findUnique, update },
    },
  } as unknown as PrismaService;

  const reverseGeocode = {
    resolve: jest.fn().mockResolvedValue(PLACE),
  } as unknown as ReverseGeocodeService;

  /** The `data` payload of the nth update call. Fails loudly if it never happened. */
  const updateData = (nth = 0): Record<string, unknown> => {
    // One deliberate cast: jest types a mock's recorded arguments as `any`, and
    // asserting on `any` would let a typo in a column name pass silently.
    const calls = update.mock.calls as unknown as [UpdateCall][];
    const call = calls[nth];
    if (!call) throw new Error(`Expected an update call at index ${nth}, but there was none.`);
    return call[0].data;
  };

  return { service: new LocationService(prisma, reverseGeocode), update, findUnique, updateData };
}

const emptyProfile = {
  id: 'profile-1',
  latitude: null,
  longitude: null,
  locationSource: null,
  landmark: null,
};

const humanPinnedProfile = {
  id: 'profile-1',
  latitude: AKWA.latitude,
  longitude: AKWA.longitude,
  locationSource: LocationSource.HUMAN_INPUT,
  landmark: 'Blue gate behind the pharmacy',
};

describe('LocationService', () => {
  describe('the human-pin rule (DIS-09)', () => {
    it('refuses an automatic fix when a hand-placed pin is on file', async () => {
      const { service, update } = makeHarness(humanPinnedProfile);

      const result = await service.setLocation(user(), {
        ...BONABERI,
        source: LocationSource.DEVICE_GPS,
      });

      // Refused, but NOT an error: the caller gets a 200 with applied:false so
      // the UI can offer "update your saved location?" instead of failing.
      expect(result.applied).toBe(false);
      expect(update).not.toHaveBeenCalled();
      // The saved pin is what comes back, not the rejected GPS reading.
      expect(result.latitude).toBe(AKWA.latitude);
      expect(result.source).toBe(LocationSource.HUMAN_INPUT);
    });

    it('applies the automatic fix when the user explicitly consents', async () => {
      const { service, updateData } = makeHarness(humanPinnedProfile);

      const result = await service.setLocation(user(), {
        ...BONABERI,
        source: LocationSource.DEVICE_GPS,
        overrideHumanPin: true,
      });

      expect(result.applied).toBe(true);
      expect(updateData().latitude).toBe(BONABERI.latitude);
    });

    it('always lets a new human pin replace an old one', async () => {
      const { service, update } = makeHarness(humanPinnedProfile);

      const result = await service.setLocation(user(), {
        ...BONABERI,
        source: LocationSource.HUMAN_INPUT,
      });

      expect(result.applied).toBe(true);
      expect(update).toHaveBeenCalled();
    });

    it('accepts an automatic fix when no pin has ever been set', async () => {
      const { service, update } = makeHarness(emptyProfile);

      const result = await service.setLocation(user(), {
        ...AKWA,
        source: LocationSource.DEVICE_GPS,
      });

      expect(result.applied).toBe(true);
      expect(update).toHaveBeenCalled();
    });

    it('does not let a HUMAN_INPUT row with no coordinates lock out every future write', async () => {
      // A half-finished write must not become a permanent block on ever
      // recording a position — there is no pin here to protect.
      const { service, update } = makeHarness({
        ...emptyProfile,
        locationSource: LocationSource.HUMAN_INPUT,
      });

      const result = await service.setLocation(user(), {
        ...AKWA,
        source: LocationSource.DEVICE_GPS,
      });

      expect(result.applied).toBe(true);
      expect(update).toHaveBeenCalled();
    });
  });

  describe('what gets written', () => {
    it('writes only the floats and lets the database trigger derive the geography', async () => {
      const { service, updateData } = makeHarness(emptyProfile);

      await service.setLocation(user(), { ...AKWA, source: LocationSource.HUMAN_INPUT });

      const data = updateData();
      expect(data.latitude).toBe(AKWA.latitude);
      expect(data.longitude).toBe(AKWA.longitude);
      // One writable source of truth: the indexed geography column can never
      // disagree with the numbers the user actually set.
      expect(data).not.toHaveProperty('location');
    });

    it('denormalises the resolved region and coarse place names', async () => {
      const { service, updateData } = makeHarness(emptyProfile);

      await service.setLocation(user(), { ...AKWA, source: LocationSource.HUMAN_INPUT });

      const data = updateData();
      expect(data.geoRegionId).toBe('region-akwa');
      expect(data.city).toBe('Douala');
      expect(data.area).toBe('Akwa');
    });

    it('distinguishes clearing a landmark from not mentioning one', async () => {
      const cleared = makeHarness(humanPinnedProfile);
      await cleared.service.setLocation(user(), {
        ...AKWA,
        source: LocationSource.HUMAN_INPUT,
        landmark: '',
      });
      expect(cleared.updateData().landmark).toBeNull();

      const untouched = makeHarness(humanPinnedProfile);
      await untouched.service.setLocation(user(), { ...AKWA, source: LocationSource.HUMAN_INPUT });
      expect(untouched.updateData()).not.toHaveProperty('landmark');
    });
  });

  describe('who may set a location', () => {
    it('rejects a role that has no profile to place on the map', async () => {
      const { service } = makeHarness(emptyProfile);

      await expect(
        service.setLocation(user({ activeRole: Role.ADMIN }), {
          ...AKWA,
          source: LocationSource.HUMAN_INPUT,
        }),
      ).rejects.toThrow(AppException);
    });

    it('rejects a caller whose profile does not exist yet', async () => {
      const { service } = makeHarness(null);

      await expect(
        service.setLocation(user(), { ...AKWA, source: LocationSource.HUMAN_INPUT }),
      ).rejects.toThrow(AppException);
    });

    it('validates coordinates before touching the database', async () => {
      const { service, findUnique } = makeHarness(emptyProfile);

      await expect(
        service.setLocation(user(), {
          latitude: 500,
          longitude: 9.7,
          source: LocationSource.HUMAN_INPUT,
        }),
      ).rejects.toThrow(AppException);

      expect(findUnique).not.toHaveBeenCalled();
    });
  });
});
