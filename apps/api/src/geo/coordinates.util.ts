import { HttpStatus } from '@nestjs/common';
import { AppException } from '../lib/app-exception';
import {
  DEFAULT_NEARBY_LIMIT,
  DEFAULT_RADIUS_M,
  MAX_NEARBY_LIMIT,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
} from './geo.config';

/**
 * Pure coordinate helpers (PROMPT 39/40).
 *
 * Kept free of Nest and Prisma so the rules that decide what counts as a valid
 * position — and what a cache key means — are unit-testable on their own. Every
 * spatial CALCULATION still happens in PostGIS; nothing here measures anything.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * How precisely a cache key pins a location.
 *
 * Three decimal places is about 110 m at the equator — roughly a city block in
 * Douala. Two neighbours asking "what quarter am I in?" then share one cached
 * answer, which is the entire point of caching an administrative lookup.
 *
 * It also limits what the cache itself knows: the key cannot be walked back to
 * anyone's doorstep, only to their block.
 */
const CACHE_PRECISION = 3;

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidCoordinates(value: Partial<Coordinates>): value is Coordinates {
  return (
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number' &&
    isValidLatitude(value.latitude) &&
    isValidLongitude(value.longitude)
  );
}

/**
 * Validates a position at the boundary and throws the standard typed error.
 *
 * Rejecting (0, 0) specifically: it is a legal coordinate in the Gulf of Guinea
 * and also what a device reports when it has no fix at all. About 700 km off
 * Douala, it would otherwise sail through validation and quietly place a worker
 * in the ocean — close enough to Cameroon to look plausible on a zoomed-out map.
 */
export function assertValidCoordinates(value: Partial<Coordinates>): Coordinates {
  const fields: Record<string, string[]> = {};

  if (typeof value.latitude !== 'number' || !isValidLatitude(value.latitude)) {
    fields.latitude = ['Latitude must be a number between -90 and 90.'];
  }
  if (typeof value.longitude !== 'number' || !isValidLongitude(value.longitude)) {
    fields.longitude = ['Longitude must be a number between -180 and 180.'];
  }

  if (Object.keys(fields).length === 0 && value.latitude === 0 && value.longitude === 0) {
    fields._ = ['That location could not be read. Try again, or drop a pin on the map.'];
  }

  if (Object.keys(fields).length > 0) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      'INVALID_COORDINATES',
      'That location could not be read.',
      fields,
    );
  }

  return { latitude: value.latitude as number, longitude: value.longitude as number };
}

/** Stable, block-level cache key for a reverse-geocode lookup. */
export function coordinateCacheKey(coordinates: Coordinates, locale: string): string {
  const lat = coordinates.latitude.toFixed(CACHE_PRECISION);
  const lng = coordinates.longitude.toFixed(CACHE_PRECISION);
  // Locale is part of the key because the ANSWER is localised: "Wouri" comes
  // back as a French name from one call and an English one from another, and
  // serving a cached French area name to an English session is exactly the kind
  // of small wrongness that makes a product feel unfinished.
  return `geo:rev:${normaliseLocale(locale)}:${lat},${lng}`;
}

/** The API speaks two languages; anything else is served English. */
export function normaliseLocale(locale: string | undefined): 'en' | 'fr' {
  return locale?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/** Clamps a requested radius into what the index can serve sensibly. */
export function clampRadius(requested: number | undefined | null): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) {
    return DEFAULT_RADIUS_M;
  }
  return Math.min(Math.max(requested, MIN_RADIUS_M), MAX_RADIUS_M);
}

/** Clamps a requested page size. Zero and negatives fall back to the default. */
export function clampLimit(requested: number | undefined | null): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_NEARBY_LIMIT;
  }
  return Math.min(Math.floor(requested), MAX_NEARBY_LIMIT);
}

/** Clamps a requested offset. Negative offsets are a client bug, not a wrap-around. */
export function clampOffset(requested: number | undefined | null): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
    return 0;
  }
  return Math.floor(requested);
}
