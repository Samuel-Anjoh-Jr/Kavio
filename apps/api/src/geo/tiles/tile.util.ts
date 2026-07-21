import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../lib/app-exception';
import { MAX_TILE_ZOOM, MIN_TILE_ZOOM } from '../geo.config';

/**
 * Slippy-map tile coordinate handling (PROMPT 41).
 *
 * Pure and dependency-free so the validation rules are testable on their own.
 * No projection maths lives here — PostGIS's ST_TileEnvelope owns that, and a
 * second implementation of Web Mercator would eventually disagree with the
 * first in a way that shows up as a map that is subtly off.
 */

export interface TileCoordinates {
  z: number;
  x: number;
  y: number;
}

/** The layers this API will render. Anything else is a 400, not a 404. */
export const TILE_LAYERS = ['worker_density', 'regions'] as const;
export type TileLayer = (typeof TILE_LAYERS)[number];

export function isTileLayer(value: string): value is TileLayer {
  return (TILE_LAYERS as readonly string[]).includes(value);
}

/**
 * Parses and bounds-checks a z/x/y triple from the URL.
 *
 * The x/y bound matters: at zoom z there are 2^z tiles per axis, and an
 * out-of-range index would otherwise produce a valid-looking envelope somewhere
 * off the edge of the world. Rejecting it keeps the tile cache from filling up
 * with entries nobody can ever legitimately request — which is both a memory
 * leak and a cheap way to hammer the database.
 */
export function parseTileCoordinates(z: string, x: string, y: string): TileCoordinates {
  const parsed = { z: Number(z), x: Number(x), y: Number(y) };
  const fields: Record<string, string[]> = {};

  if (!Number.isInteger(parsed.z) || parsed.z < MIN_TILE_ZOOM || parsed.z > MAX_TILE_ZOOM) {
    fields.z = [`Zoom must be an integer between ${MIN_TILE_ZOOM} and ${MAX_TILE_ZOOM}.`];
  }

  if (fields.z === undefined) {
    const max = 2 ** parsed.z - 1;
    if (!Number.isInteger(parsed.x) || parsed.x < 0 || parsed.x > max) {
      fields.x = [`x must be an integer between 0 and ${max} at zoom ${parsed.z}.`];
    }
    if (!Number.isInteger(parsed.y) || parsed.y < 0 || parsed.y > max) {
      fields.y = [`y must be an integer between 0 and ${max} at zoom ${parsed.z}.`];
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      'INVALID_TILE_COORDINATES',
      'That map tile could not be read.',
      fields,
    );
  }

  return parsed;
}

/** Redis key for a rendered tile. Layer first, so a layer can be purged as a unit. */
export function tileCacheKey(layer: TileLayer, tile: TileCoordinates): string {
  return `geo:tile:${layer}:${tile.z}:${tile.x}:${tile.y}`;
}
