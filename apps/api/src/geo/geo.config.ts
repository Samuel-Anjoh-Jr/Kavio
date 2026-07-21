/**
 * Geo configuration (PROMPTS 39-41, SRS §12).
 *
 * Every knob here has a working default, because the whole spatial stack has to
 * run for a contributor with no API keys: PostGIS answers "where is this?" from
 * our own boundaries, and tiles are generated locally. BigDataCloud and CARTO
 * make it faster and prettier — neither is load-bearing.
 */

export interface BigDataCloudConfig {
  /** Free tier works without one; a key raises the rate limit. */
  apiKey: string;
  baseUrl: string;
  /** Beyond this, the lookup is abandoned and PostGIS answers instead. */
  timeoutMs: number;
}

export interface CartoConfig {
  apiKey: string;
  baseUrl: string;
  /** The CARTO connection registered against this Postgres, if any. */
  connectionName: string;
}

export function getBigDataCloudConfig(): BigDataCloudConfig {
  return {
    apiKey: process.env.BIGDATACLOUD_KEY ?? '',
    baseUrl: process.env.BIGDATACLOUD_BASE_URL ?? 'https://api-bdc.net/data',
    timeoutMs: Number(process.env.BIGDATACLOUD_TIMEOUT_MS ?? 2500),
  };
}

export function getCartoConfig(): CartoConfig {
  return {
    apiKey: process.env.CARTO_API_KEY ?? '',
    baseUrl: process.env.CARTO_BASE_URL ?? 'https://gcp-us-east1.api.carto.com',
    connectionName: process.env.CARTO_CONNECTION_NAME ?? '',
  };
}

export function isCartoConfigured(config: CartoConfig = getCartoConfig()): boolean {
  return config.apiKey.length > 0 && config.connectionName.length > 0;
}

/**
 * How long a resolved administrative area stays cached.
 *
 * A day, because administrative boundaries change on the timescale of
 * government decrees, not user sessions. The cache key is a rounded coordinate
 * (see `coordinates.util.ts`), so this is genuinely reusable across users
 * standing in the same street rather than a per-request memo.
 */
export const REVERSE_GEOCODE_CACHE_TTL_SECONDS = Number(
  process.env.GEO_REVERSE_CACHE_TTL_SECONDS ?? 86_400,
);

/**
 * How long a rendered vector tile is cached.
 *
 * Short, because the worker-density layer is the visible proof that the
 * marketplace is filling up — a new worker in a quarter should show up in
 * minutes, not tomorrow.
 */
export const TILE_CACHE_TTL_SECONDS = Number(process.env.GEO_TILE_CACHE_TTL_SECONDS ?? 300);

/** Search radius bounds, in metres. */
export const MIN_RADIUS_M = 100;
export const MAX_RADIUS_M = 100_000;
export const DEFAULT_RADIUS_M = 10_000;

/** Page size bounds for proximity reads. */
export const MAX_NEARBY_LIMIT = 100;
export const DEFAULT_NEARBY_LIMIT = 20;

/** Zoom range the tile endpoints will serve. */
export const MIN_TILE_ZOOM = 0;
export const MAX_TILE_ZOOM = 18;
