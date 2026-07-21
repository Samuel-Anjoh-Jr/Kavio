import { AppException } from '../lib/app-exception';
import {
  assertValidCoordinates,
  clampLimit,
  clampOffset,
  clampRadius,
  coordinateCacheKey,
  isValidCoordinates,
  normaliseLocale,
} from './coordinates.util';
import {
  DEFAULT_NEARBY_LIMIT,
  DEFAULT_RADIUS_M,
  MAX_NEARBY_LIMIT,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
} from './geo.config';

/** Douala, Akwa. The reference point for anything that needs a real position. */
const DOUALA = { latitude: 4.0503, longitude: 9.7 };

describe('isValidCoordinates', () => {
  it('accepts a real position', () => {
    expect(isValidCoordinates(DOUALA)).toBe(true);
  });

  it('rejects out-of-range values', () => {
    expect(isValidCoordinates({ latitude: 91, longitude: 9.7 })).toBe(false);
    expect(isValidCoordinates({ latitude: 4, longitude: 181 })).toBe(false);
  });

  it('rejects NaN and Infinity, which JSON.parse can produce from bad input', () => {
    expect(isValidCoordinates({ latitude: Number.NaN, longitude: 9.7 })).toBe(false);
    expect(isValidCoordinates({ latitude: 4, longitude: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('rejects a missing coordinate rather than defaulting it to zero', () => {
    expect(isValidCoordinates({ latitude: 4.05 })).toBe(false);
  });
});

describe('assertValidCoordinates', () => {
  it('returns the position unchanged when it is valid', () => {
    expect(assertValidCoordinates(DOUALA)).toEqual(DOUALA);
  });

  it('throws a typed, per-field error for an out-of-range latitude', () => {
    expect.assertions(3);
    try {
      assertValidCoordinates({ latitude: 200, longitude: 9.7 });
    } catch (error) {
      const exception = error as AppException;
      expect(exception).toBeInstanceOf(AppException);
      expect(exception.code).toBe('INVALID_COORDINATES');
      expect(exception.fields?.latitude).toBeDefined();
    }
  });

  it('rejects null island — a legal coordinate that means "no fix"', () => {
    // (0, 0) is in the Gulf of Guinea, ~700 km off Douala. It passes every range
    // check and is what a device reports when it has nothing, so it has to be
    // refused explicitly or workers end up quietly placed in the ocean.
    expect(() => assertValidCoordinates({ latitude: 0, longitude: 0 })).toThrow(AppException);
  });

  it('does not reject a legitimate coordinate that merely contains a zero', () => {
    expect(() => assertValidCoordinates({ latitude: 0, longitude: 9.7 })).not.toThrow();
    expect(() => assertValidCoordinates({ latitude: 4.05, longitude: 0 })).not.toThrow();
  });
});

describe('coordinateCacheKey', () => {
  it('gives two people on the same block the same key', () => {
    // ~30 m apart: one cached administrative answer should serve both.
    const a = coordinateCacheKey({ latitude: 4.05031, longitude: 9.70009 }, 'en');
    const b = coordinateCacheKey({ latitude: 4.05037, longitude: 9.70002 }, 'en');
    expect(a).toBe(b);
  });

  it('separates locations that are genuinely different places', () => {
    const akwa = coordinateCacheKey(DOUALA, 'en');
    const bonaberi = coordinateCacheKey({ latitude: 4.08, longitude: 9.667 }, 'en');
    expect(akwa).not.toBe(bonaberi);
  });

  it('keys by locale, so an English session never gets a cached French name', () => {
    expect(coordinateCacheKey(DOUALA, 'en')).not.toBe(coordinateCacheKey(DOUALA, 'fr'));
  });

  it('normalises the locale into the key rather than trusting the caller', () => {
    expect(coordinateCacheKey(DOUALA, 'fr-CM')).toBe(coordinateCacheKey(DOUALA, 'fr'));
  });
});

describe('normaliseLocale', () => {
  it.each([
    ['fr', 'fr'],
    ['fr-CM', 'fr'],
    ['FR', 'fr'],
    ['en', 'en'],
    ['en-GB', 'en'],
    ['de', 'en'],
    [undefined, 'en'],
  ])('maps %s to %s', (input, expected) => {
    expect(normaliseLocale(input)).toBe(expected);
  });
});

describe('clampRadius', () => {
  it('keeps a sensible radius as asked', () => {
    expect(clampRadius(5000)).toBe(5000);
  });

  it('clamps rather than rejecting, so a bad number never fails the search', () => {
    expect(clampRadius(1)).toBe(MIN_RADIUS_M);
    expect(clampRadius(10_000_000)).toBe(MAX_RADIUS_M);
  });

  it('falls back to the default for a missing or unusable value', () => {
    expect(clampRadius(null)).toBe(DEFAULT_RADIUS_M);
    expect(clampRadius(undefined)).toBe(DEFAULT_RADIUS_M);
    expect(clampRadius(Number.NaN)).toBe(DEFAULT_RADIUS_M);
  });
});

describe('clampLimit', () => {
  it('caps the page size so one request cannot drain the table', () => {
    expect(clampLimit(1000)).toBe(MAX_NEARBY_LIMIT);
  });

  it('treats zero and negatives as "unspecified" rather than "none"', () => {
    expect(clampLimit(0)).toBe(DEFAULT_NEARBY_LIMIT);
    expect(clampLimit(-5)).toBe(DEFAULT_NEARBY_LIMIT);
  });

  it('floors a fractional limit — SQL LIMIT will not take 10.5', () => {
    expect(clampLimit(10.9)).toBe(10);
  });
});

describe('clampOffset', () => {
  it('passes a real offset through', () => {
    expect(clampOffset(40)).toBe(40);
  });

  it('floors a negative offset to zero instead of wrapping', () => {
    expect(clampOffset(-10)).toBe(0);
    expect(clampOffset(null)).toBe(0);
  });
});
