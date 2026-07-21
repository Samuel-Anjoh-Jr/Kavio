import { AppException } from '../../lib/app-exception';
import { isTileLayer, parseTileCoordinates, tileCacheKey } from './tile.util';

describe('isTileLayer', () => {
  it('accepts the layers this API renders', () => {
    expect(isTileLayer('worker_density')).toBe(true);
    expect(isTileLayer('regions')).toBe(true);
  });

  it('rejects anything else — the layer name reaches a SQL lookup', () => {
    expect(isTileLayer('workers')).toBe(false);
    expect(isTileLayer('geo.mvt_worker_density')).toBe(false);
    expect(isTileLayer('')).toBe(false);
  });
});

describe('parseTileCoordinates', () => {
  it('parses a valid tile', () => {
    expect(parseTileCoordinates('12', '2043', '1985')).toEqual({ z: 12, x: 2043, y: 1985 });
  });

  it('accepts the single tile at zoom 0', () => {
    expect(parseTileCoordinates('0', '0', '0')).toEqual({ z: 0, x: 0, y: 0 });
  });

  it('rejects a zoom outside what we serve', () => {
    expect(() => parseTileCoordinates('25', '0', '0')).toThrow(AppException);
    expect(() => parseTileCoordinates('-1', '0', '0')).toThrow(AppException);
  });

  it('rejects x/y outside the 2^z grid for that zoom', () => {
    // At zoom 1 there are 2 tiles per axis, so index 2 does not exist. Without
    // this bound it would produce a plausible-looking envelope off the edge of
    // the world — and a cache entry nobody can ever legitimately request.
    expect(() => parseTileCoordinates('1', '2', '0')).toThrow(AppException);
    expect(() => parseTileCoordinates('1', '0', '2')).toThrow(AppException);
    expect(parseTileCoordinates('1', '1', '1')).toEqual({ z: 1, x: 1, y: 1 });
  });

  it('rejects non-integers, including the ".mvt" that a bad route would leave attached', () => {
    expect(() => parseTileCoordinates('12', '2043', '1985.mvt')).toThrow(AppException);
    expect(() => parseTileCoordinates('12', '20.5', '1985')).toThrow(AppException);
  });

  it('carries a typed code and per-field messages', () => {
    expect.assertions(2);
    try {
      parseTileCoordinates('99', '0', '0');
    } catch (error) {
      const exception = error as AppException;
      expect(exception.code).toBe('INVALID_TILE_COORDINATES');
      expect(exception.fields?.z).toBeDefined();
    }
  });
});

describe('tileCacheKey', () => {
  it('is stable for the same tile', () => {
    const key = tileCacheKey('regions', { z: 12, x: 2043, y: 1985 });
    expect(key).toBe(tileCacheKey('regions', { z: 12, x: 2043, y: 1985 }));
  });

  it('namespaces by layer so one layer can be purged without the other', () => {
    const tile = { z: 12, x: 2043, y: 1985 };
    expect(tileCacheKey('regions', tile)).not.toBe(tileCacheKey('worker_density', tile));
    expect(tileCacheKey('regions', tile).startsWith('geo:tile:regions:')).toBe(true);
  });
});
