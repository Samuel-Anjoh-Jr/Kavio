import { Injectable } from '@nestjs/common';
import type { GeoRegionLevel } from '@trustpro/database';
import { PrismaService } from '../prisma/prisma.service';
import { assertValidCoordinates, clampLimit, type Coordinates } from './coordinates.util';
import type { GeoRegionView, LandmarkView } from './models/geo.model';

/** Rows from the geo.region view — snake_case, straight from SQL. */
interface RegionRow {
  id: string;
  slug: string;
  nameEn: string;
  nameFr: string;
  level: GeoRegionLevel;
  parentId: string | null;
  parent_name_en: string | null;
  parent_name_fr: string | null;
  latitude: number | null;
  longitude: number | null;
  boundary_is_authoritative: boolean;
}

interface LandmarkRow {
  osm_id: bigint;
  name: string;
  category: string | null;
  latitude: number;
  longitude: number;
  distance_m: number;
}

/**
 * Region and landmark reads (PROMPT 38/40).
 *
 * Everything goes through the reviewed `geo.*` views and functions rather than
 * Prisma model access, because the columns that matter — `boundary`, `center` —
 * are geography types Prisma declares Unsupported and cannot select.
 */
@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Active regions, optionally filtered to one level or one parent.
   *
   * Ordered by name rather than by size or id: this feeds a picker a human
   * scrolls, and alphabetical is the only order they can predict.
   */
  async regions(filter: {
    level?: GeoRegionLevel | null;
    parentId?: string | null;
  }): Promise<GeoRegionView[]> {
    const rows = await this.prisma.client.$queryRaw<RegionRow[]>`
      SELECT *
      FROM geo.region
      WHERE "isActive"
        AND (${filter.level ?? null}::"GeoRegionLevel" IS NULL OR "level" = ${filter.level ?? null}::"GeoRegionLevel")
        AND (${filter.parentId ?? null}::uuid IS NULL OR "parentId" = ${filter.parentId ?? null}::uuid)
      ORDER BY "nameEn"
    `;

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      nameEn: row.nameEn,
      nameFr: row.nameFr,
      level: row.level,
      parentId: row.parentId,
      parentNameEn: row.parent_name_en,
      parentNameFr: row.parent_name_fr,
      latitude: row.latitude,
      longitude: row.longitude,
      boundaryIsAuthoritative: row.boundary_is_authoritative,
    }));
  }

  /**
   * Named OSM landmarks near a point.
   *
   * "Behind the Total station in Bonapriso" is how people actually give an
   * address here. Offering the real landmarks near a dropped pin turns that
   * habit into structured data instead of fighting it with a street-address form
   * the city does not fully support.
   */
  async nearbyLandmarks(
    coordinates: Partial<Coordinates>,
    radiusM?: number | null,
    limit?: number | null,
  ): Promise<LandmarkView[]> {
    const point = assertValidCoordinates(coordinates);
    // A landmark 5 km away is not a landmark; 2 km is a generous ceiling.
    const radius = Math.min(Math.max(radiusM ?? 500, 50), 2000);

    const rows = await this.prisma.client.$queryRaw<LandmarkRow[]>`
      SELECT * FROM geo.nearby_landmarks(
        ${point.latitude}::double precision,
        ${point.longitude}::double precision,
        ${radius}::double precision,
        ${clampLimit(limit ?? 8)}::integer
      )
    `;

    return rows.map((row) => ({
      // BIGINT does not survive GraphQL's Int, and OSM ids are past 2^31.
      osmId: String(row.osm_id),
      name: row.name,
      category: row.category,
      latitude: row.latitude,
      longitude: row.longitude,
      distanceM: Math.round(row.distance_m),
    }));
  }
}
