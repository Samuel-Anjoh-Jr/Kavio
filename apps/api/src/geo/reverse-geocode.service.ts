import { Injectable } from '@nestjs/common';
import type { GeoRegionLevel } from '@kavio/database';
import { describeError } from '../lib/describe-error';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BigDataCloudClient } from './bigdatacloud.client';
import { coordinateCacheKey, normaliseLocale, type Coordinates } from './coordinates.util';
import { REVERSE_GEOCODE_CACHE_TTL_SECONDS } from './geo.config';

const logger = createLogger('geo.reverse-geocode');

/** A resolved place: our region row where we have one, a provider name always. */
export interface ResolvedPlace {
  /** The GeoRegion the point falls in, if any boundary covers it. */
  regionId: string | null;
  regionSlug: string | null;
  regionLevel: GeoRegionLevel | null;
  /** Most local name we can offer, localised. */
  locality: string | null;
  /** The city/commune, for the coarse `city` column on profiles. */
  city: string | null;
  principalSubdivision: string | null;
  countryCode: string | null;
  /** Where the naming came from — surfaced so the UI can be honest about it. */
  source: 'cache' | 'bigdatacloud' | 'postgis' | 'unresolved';
}

interface RegionRow {
  id: string;
  slug: string;
  name_en: string;
  name_fr: string;
  level: GeoRegionLevel;
  parent_id: string | null;
}

/**
 * Coordinates → administrative area (PROMPT 39, DIS-09).
 *
 * Two sources, doing two different jobs:
 *
 *   PostGIS        WHICH REGION this is — the row id everything else filters on
 *   BigDataCloud   WHAT IT IS CALLED — a name for places our boundaries miss
 *
 * PostGIS is consulted for the region on every resolve, cached or not, because
 * that id is load-bearing: a stale or provider-supplied region would silently
 * mis-file a worker. BigDataCloud only ever contributes strings a human reads.
 */
@Injectable()
export class ReverseGeocodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly bigDataCloud: BigDataCloudClient,
  ) {}

  /**
   * Resolves a position. Repeat lookups from the same block hit the cache.
   *
   * Never throws on a provider or cache failure — an unresolved place is a
   * degraded answer, not an error. The user still has coordinates, and a pin
   * with no area name is far better than a location-setter that refuses to work
   * because a third party is having a bad day.
   */
  async resolve(coordinates: Coordinates, locale?: string): Promise<ResolvedPlace> {
    const lang = normaliseLocale(locale);
    const cacheKey = coordinateCacheKey(coordinates, lang);

    const cached = await this.readCache(cacheKey);
    if (cached) {
      return { ...cached, source: 'cache' };
    }

    // Our own boundaries first: this is the authoritative half of the answer.
    const region = await this.regionAtPoint(coordinates);

    const area = await this.bigDataCloud.reverseGeocode(coordinates, lang);

    const resolved: ResolvedPlace = {
      regionId: region?.id ?? null,
      regionSlug: region?.slug ?? null,
      regionLevel: region?.level ?? null,
      // Our region name wins when we have one: it matches the names used
      // everywhere else in the product, and consistency beats a provider's
      // possibly-better-but-different label.
      locality: region
        ? lang === 'fr'
          ? region.name_fr
          : region.name_en
        : (area?.locality ?? null),
      city: (await this.cityFor(region)) ?? area?.city ?? null,
      principalSubdivision: area?.principalSubdivision ?? null,
      countryCode: area?.countryCode ?? null,
      source: region ? 'postgis' : area ? 'bigdatacloud' : 'unresolved',
    };

    // An unresolved answer is not cached: it usually means the provider was
    // unreachable, and caching that for a day would extend a 2-second outage
    // into a day-long one for everyone standing on that block.
    if (resolved.source !== 'unresolved') {
      await this.writeCache(cacheKey, resolved);
    }

    return resolved;
  }

  /** The smallest active region whose boundary covers the point, or null. */
  private async regionAtPoint(coordinates: Coordinates): Promise<RegionRow | null> {
    const rows = await this.prisma.client.$queryRaw<RegionRow[]>`
      SELECT id, slug, name_en, name_fr, level, parent_id
      FROM geo.region_at_point(${coordinates.latitude}::double precision, ${coordinates.longitude}::double precision)
    `;
    return rows[0] ?? null;
  }

  /**
   * Walks up to the CITY ancestor, so a worker in Akwa records "Douala" in the
   * coarse `city` column rather than the quarter — which is what the non-spatial
   * filters and the profile header expect to read.
   */
  private async cityFor(region: RegionRow | null): Promise<string | null> {
    if (!region) return null;
    if (region.level === 'CITY') return region.name_en;

    const rows = await this.prisma.client.$queryRaw<{ name_en: string }[]>`
      WITH RECURSIVE ancestry AS (
        SELECT r."id", r."parentId", r."nameEn", r."level"
        FROM "GeoRegion" r
        WHERE r."id" = ${region.id}::uuid
        UNION ALL
        SELECT p."id", p."parentId", p."nameEn", p."level"
        FROM "GeoRegion" p
        JOIN ancestry a ON a."parentId" = p."id"
      )
      SELECT a."nameEn" AS name_en
      FROM ancestry a
      WHERE a."level" = 'CITY'
      LIMIT 1
    `;

    return rows[0]?.name_en ?? null;
  }

  private async readCache(key: string): Promise<ResolvedPlace | null> {
    try {
      const raw = await this.redis.client.get(key);
      return raw ? (JSON.parse(raw) as ResolvedPlace) : null;
    } catch (error) {
      // A cache that is down is a slow path, not a broken one.
      logger.warn('Reverse-geocode cache read failed', {
        payload: { reason: describeError(error) },
      });
      return null;
    }
  }

  private async writeCache(key: string, place: ResolvedPlace): Promise<void> {
    try {
      await this.redis.client.set(
        key,
        JSON.stringify(place),
        'EX',
        REVERSE_GEOCODE_CACHE_TTL_SECONDS,
      );
    } catch (error) {
      logger.warn('Reverse-geocode cache write failed', {
        payload: { reason: describeError(error) },
      });
    }
  }
}
