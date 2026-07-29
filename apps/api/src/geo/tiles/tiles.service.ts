import { Injectable } from '@nestjs/common';
import { describeError } from '../../lib/describe-error';
import { createLogger } from '../../lib/logger';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { getCartoConfig, isCartoConfigured, TILE_CACHE_TTL_SECONDS } from '../geo.config';
import { tileCacheKey, type TileCoordinates, type TileLayer } from './tile.util';

const logger = createLogger('geo.tiles');

/** A TileJSON document, the descriptor Mapbox GL JS loads before any tile. */
export interface TileJson {
  tilejson: '3.0.0';
  name: string;
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  bounds: [number, number, number, number];
  attribution: string;
  /** Which path is serving these tiles, so the client can be inspected honestly. */
  scheme: 'carto' | 'postgis';
}

/** The PostGIS function behind each layer. Never interpolated from user input. */
const LAYER_FUNCTIONS: Record<TileLayer, string> = {
  worker_density: 'geo.mvt_worker_density',
  regions: 'geo.mvt_regions',
};

/**
 * Dynamic vector tiles from live PostGIS data (PROMPT 41, SRS §12).
 *
 * ── Why this is REST and not GraphQL ────────────────────────────────────────
 * The DUAL API RULE puts reads on GraphQL. A vector tile is the one honest
 * exception: it is binary protobuf fetched by Mapbox GL's own tile loader,
 * which speaks HTTP and z/x/y URLs and knows nothing about Apollo. Forcing it
 * through GraphQL would mean base64-encoding every tile into a JSON envelope —
 * a third more bytes, on the exact code path where bandwidth is scarcest, to
 * satisfy a rule whose purpose (one normalised cache for structured reads) a
 * tile does not participate in anyway.
 *
 * ── Where CARTO fits ────────────────────────────────────────────────────────
 * CARTO is a delivery and spatial-SQL layer OVER this database, not a copy of
 * it. When configured, the TileJSON points Mapbox at CARTO's tileset endpoint
 * and CARTO runs the same functions against the same Postgres. When it is not,
 * the API serves the identical bytes itself. Either way PostGIS computes the
 * tile, so a developer with no CARTO account sees exactly what production
 * renders — which is the property that makes the map debuggable at all.
 */
@Injectable()
export class TilesService {
  private readonly carto = getCartoConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Renders one MVT tile.
   *
   * An empty Buffer is a legitimate answer meaning "nothing here" and is cached
   * like any other: blank ocean tiles are the majority of requests around a
   * coastal city, and re-querying PostGIS to rediscover that Douala's harbour
   * is still empty would be the single largest source of load on this endpoint.
   */
  async renderTile(layer: TileLayer, tile: TileCoordinates): Promise<Buffer> {
    const key = tileCacheKey(layer, tile);

    const cached = await this.readCache(key);
    if (cached) return cached;

    const started = Date.now();

    // The function name comes from a closed record keyed by an already-validated
    // layer — never from the request — so this interpolation cannot be a target.
    const rows = await this.prisma.client.$queryRawUnsafe<{ tile: Buffer }[]>(
      `SELECT ${LAYER_FUNCTIONS[layer]}($1::integer, $2::integer, $3::integer) AS tile`,
      tile.z,
      tile.x,
      tile.y,
    );

    const durationMs = Date.now() - started;
    const buffer = rows[0]?.tile ?? Buffer.alloc(0);

    if (durationMs > 300) {
      logger.warn('Slow tile render', { durationMs, payload: { layer, ...tile } });
    }

    await this.writeCache(key, buffer);
    return buffer;
  }

  /**
   * The TileJSON descriptor for a layer.
   *
   * `bounds` is the launch geography rather than the whole world: it tells
   * Mapbox not to request tiles for places we have no data for, which on a
   * 3G phone is a meaningful number of round-trips never made.
   */
  tileJson(layer: TileLayer, publicBaseUrl: string): TileJson {
    const useCarto = isCartoConfigured(this.carto);

    const tiles = useCarto
      ? [
          `${this.carto.baseUrl}/v3/maps/${encodeURIComponent(this.carto.connectionName)}/tileset/{z}/{x}/{y}?layer=${encodeURIComponent(layer)}`,
        ]
      : [`${publicBaseUrl}/tiles/${layer}/{z}/{x}/{y}.mvt`];

    return {
      tilejson: '3.0.0',
      name: layer,
      tiles,
      minzoom: 0,
      maxzoom: 18,
      // [west, south, east, north] — Douala through Yaoundé with headroom.
      bounds: [9.4, 3.6, 11.8, 4.3],
      attribution: '© OpenStreetMap contributors · Kavio',
      scheme: useCarto ? 'carto' : 'postgis',
    };
  }

  private async readCache(key: string): Promise<Buffer | null> {
    try {
      // getBuffer, not get: a tile is protobuf, and decoding it as UTF-8 on the
      // way out of Redis would corrupt every byte above 0x7F.
      return await this.redis.client.getBuffer(key);
    } catch (error) {
      logger.warn('Tile cache read failed', { payload: { reason: describeError(error) } });
      return null;
    }
  }

  private async writeCache(key: string, tile: Buffer): Promise<void> {
    try {
      await this.redis.client.set(key, tile, 'EX', TILE_CACHE_TTL_SECONDS);
    } catch (error) {
      logger.warn('Tile cache write failed', { payload: { reason: describeError(error) } });
    }
  }
}
