import { describe, expect, it } from 'vitest';
import {
  clampRadius,
  DEFAULT_RADIUS_M,
  formatArea,
  formatDistance,
  isValidCoordinate,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  mergeLocation,
  roundCoordinate,
  type BrowsingLocation,
} from './geo';

const pin: BrowsingLocation = {
  latitude: 4.0511,
  longitude: 9.7679,
  source: 'HUMAN_INPUT',
  landmark: 'Carrefour Ndokotti',
  label: 'Akwa, Douala',
  radiusM: 5_000,
  setAt: 1_700_000_000_000,
};

describe('clampRadius', () => {
  it('falls back to the default for anything unusable', () => {
    expect(clampRadius(null)).toBe(DEFAULT_RADIUS_M);
    expect(clampRadius(undefined)).toBe(DEFAULT_RADIUS_M);
    expect(clampRadius(Number.NaN)).toBe(DEFAULT_RADIUS_M);
  });

  it('clamps to the same bounds the API applies', () => {
    expect(clampRadius(1)).toBe(MIN_RADIUS_M);
    expect(clampRadius(9_999_999)).toBe(MAX_RADIUS_M);
    expect(clampRadius(3_000)).toBe(3_000);
  });
});

describe('isValidCoordinate', () => {
  it('accepts a real Douala coordinate', () => {
    expect(isValidCoordinate(4.0511, 9.7679)).toBe(true);
  });

  it('rejects out-of-range, non-finite and non-numeric values', () => {
    expect(isValidCoordinate(91, 9)).toBe(false);
    expect(isValidCoordinate(4, 181)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 9)).toBe(false);
    expect(isValidCoordinate('4', '9')).toBe(false);
  });

  it('rejects Null Island, the signature of an uninitialised pair', () => {
    expect(isValidCoordinate(0, 0)).toBe(false);
    // A genuine coordinate with one zero component is still valid.
    expect(isValidCoordinate(0, 9.7679)).toBe(true);
  });
});

describe('roundCoordinate', () => {
  it('truncates doorway-level precision to roughly 11 metres', () => {
    expect(roundCoordinate(4.051123456)).toBe(4.0511);
    expect(roundCoordinate(-9.767987654)).toBe(-9.768);
  });
});

describe('mergeLocation', () => {
  it('applies an automatic fix when nothing is stored', () => {
    const result = mergeLocation(null, {
      latitude: 4.06,
      longitude: 9.71,
      source: 'DEVICE_GPS',
    });

    expect(result.applied).toBe(true);
    expect(result.location.source).toBe('DEVICE_GPS');
    expect(result.location.radiusM).toBe(DEFAULT_RADIUS_M);
  });

  it('refuses an automatic fix over a human pin, and keeps the pin', () => {
    const result = mergeLocation(pin, {
      latitude: 4.06,
      longitude: 9.71,
      source: 'DEVICE_GPS',
    });

    expect(result.applied).toBe(false);
    expect(result.location).toBe(pin);
  });

  it('replaces a human pin when the user explicitly consents', () => {
    const result = mergeLocation(
      pin,
      { latitude: 4.06, longitude: 9.71, source: 'DEVICE_GPS' },
      { overrideHumanPin: true },
    );

    expect(result.applied).toBe(true);
    expect(result.location.latitude).toBe(4.06);
  });

  it('lets a new human pin replace an older one without consent ceremony', () => {
    const result = mergeLocation(pin, {
      latitude: 4.07,
      longitude: 9.72,
      source: 'HUMAN_INPUT',
    });

    expect(result.applied).toBe(true);
    expect(result.location.source).toBe('HUMAN_INPUT');
  });

  it('carries the current radius forward when the incoming fix omits one', () => {
    const result = mergeLocation(
      { ...pin, source: 'DEVICE_GPS' },
      { latitude: 4.06, longitude: 9.71, source: 'DEVICE_GPS' },
    );

    expect(result.location.radiusM).toBe(5_000);
  });
});

describe('formatDistance', () => {
  const t = (key: 'metres' | 'kilometres', values: { value: string }) =>
    key === 'metres' ? `${values.value} m` : `${values.value} km`;

  it('rounds sub-kilometre distances to 50 m, never implying doorway precision', () => {
    expect(formatDistance(480, t)).toBe('500 m');
    expect(formatDistance(120, t)).toBe('100 m');
  });

  it('never renders 0 m, which would read as "at your exact address"', () => {
    expect(formatDistance(0, t)).toBe('50 m');
  });

  it('uses one decimal under 10 km and whole kilometres above', () => {
    expect(formatDistance(2_340, t)).toBe('2.3 km');
    expect(formatDistance(23_400, t)).toBe('23 km');
  });

  it('returns null when there is no distance to show', () => {
    expect(formatDistance(null, t)).toBeNull();
    expect(formatDistance(undefined, t)).toBeNull();
    expect(formatDistance(-5, t)).toBeNull();
  });
});

describe('formatArea', () => {
  it('joins the parts that exist', () => {
    expect(formatArea({ area: 'Akwa', city: 'Douala' })).toBe('Akwa, Douala');
    expect(formatArea({ area: null, city: 'Douala' })).toBe('Douala');
  });

  it('collapses a quarter that shares its city name', () => {
    expect(formatArea({ area: 'Douala', city: 'Douala' })).toBe('Douala');
  });

  it('returns null rather than an empty string when nothing is known', () => {
    expect(formatArea({ area: null, city: null })).toBeNull();
    expect(formatArea({ area: '  ', city: undefined })).toBeNull();
  });
});
