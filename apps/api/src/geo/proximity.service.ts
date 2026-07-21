import { Injectable } from '@nestjs/common';
import type { VerificationTier } from '@trustpro/database';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertValidCoordinates,
  clampLimit,
  clampOffset,
  clampRadius,
  type Coordinates,
} from './coordinates.util';

const logger = createLogger('geo.proximity');

/** Warn threshold from the engineering standards — a slow spatial query is a bug. */
const SLOW_QUERY_MS = 300;

export interface NearbyWorkersQuery extends Partial<Coordinates> {
  radiusM?: number | null;
  limit?: number | null;
  offset?: number | null;
  categoryId?: string | null;
  minTrustScore?: number | null;
  regionId?: string | null;
}

export interface NearbyWorker {
  workerProfileId: string;
  userId: string;
  name: string | null;
  avatar: string | null;
  headline: string | null;
  city: string | null;
  area: string | null;
  landmark: string | null;
  regionSlug: string | null;
  regionNameEn: string | null;
  regionNameFr: string | null;
  tier: VerificationTier;
  trustScore: number;
  completedJobs: number;
  averageRating: number | null;
  latitude: number;
  longitude: number;
  distanceM: number;
}

export interface NearbyWorkersResult {
  workers: NearbyWorker[];
  totalCount: number;
  /** The radius actually used, after clamping — the client should show THIS. */
  radiusM: number;
  /**
   * True when the search was well-formed and simply found nobody.
   *
   * DIS-06 requires a friendly, explicit "no providers for this service here
   * yet" instead of an ambiguous empty list. Deciding it server-side means the
   * web layer cannot accidentally render "0 results" as an error state.
   */
  noProvidersInArea: boolean;
}

/** Row shape returned by geo.nearby_workers — snake_case, straight from SQL. */
interface NearbyWorkerRow {
  worker_profile_id: string;
  user_id: string;
  name: string | null;
  avatar: string | null;
  headline: string | null;
  city: string | null;
  area: string | null;
  landmark: string | null;
  region_slug: string | null;
  region_name_en: string | null;
  region_name_fr: string | null;
  tier: VerificationTier;
  trust_score: number;
  completed_jobs: number;
  average_rating: unknown;
  latitude: number;
  longitude: number;
  distance_m: number;
  total_count: bigint;
}

/**
 * Proximity reads (PROMPT 40; DIS-06, DIS-07).
 *
 * Every measurement here happens in PostGIS. This class validates, clamps and
 * maps — it does not compute a distance, and it must not start to. The rule is
 * not stylistic: ranking, radius filtering and region containment have to agree
 * with each other, and they only do that while one engine decides all three.
 *
 * The heavy lifting lives in `geo.nearby_workers` (a reviewed SQL function), so
 * the query plan is something a DBA can read and EXPLAIN rather than something
 * assembled from string fragments at runtime.
 */
@Injectable()
export class ProximityService {
  constructor(private readonly prisma: PrismaService) {}

  async nearbyWorkers(query: NearbyWorkersQuery): Promise<NearbyWorkersResult> {
    const coordinates = assertValidCoordinates(query);
    const radiusM = clampRadius(query.radiusM);
    const limit = clampLimit(query.limit);
    const offset = clampOffset(query.offset);
    const minTrustScore = Math.max(0, Math.floor(query.minTrustScore ?? 0));

    const started = Date.now();

    const rows = await this.prisma.client.$queryRaw<NearbyWorkerRow[]>`
      SELECT * FROM geo.nearby_workers(
        ${coordinates.latitude}::double precision,
        ${coordinates.longitude}::double precision,
        ${radiusM}::double precision,
        ${limit}::integer,
        ${offset}::integer,
        ${query.categoryId ?? null}::uuid,
        ${minTrustScore}::integer,
        ${query.regionId ?? null}::uuid
      )
    `;

    const durationMs = Date.now() - started;
    if (durationMs > SLOW_QUERY_MS) {
      logger.warn('Slow proximity query', {
        durationMs,
        payload: { radiusM, limit, offset, hasCategory: Boolean(query.categoryId) },
      });
    }

    // `total_count` is a window function over the matched set, so it is the same
    // on every row — and absent entirely when nothing matched.
    const totalCount = rows.length > 0 ? Number(rows[0]?.total_count ?? 0) : 0;

    return {
      workers: rows.map(toNearbyWorker),
      totalCount,
      radiusM,
      // Only page one can conclude "nobody here". An empty page five means the
      // caller walked off the end of a result set that does have providers.
      noProvidersInArea: totalCount === 0 && offset === 0,
    };
  }
}

function toNearbyWorker(row: NearbyWorkerRow): NearbyWorker {
  return {
    workerProfileId: row.worker_profile_id,
    userId: row.user_id,
    name: row.name,
    avatar: row.avatar,
    headline: row.headline,
    city: row.city,
    area: row.area,
    landmark: row.landmark,
    regionSlug: row.region_slug,
    regionNameEn: row.region_name_en,
    regionNameFr: row.region_name_fr,
    tier: row.tier,
    trustScore: Number(row.trust_score),
    completedJobs: Number(row.completed_jobs),
    // Postgres NUMERIC arrives as a Decimal-like object, not a JS number.
    averageRating: row.average_rating === null ? null : Number(row.average_rating),
    latitude: row.latitude,
    longitude: row.longitude,
    // Metres, rounded: sub-metre precision on a GPS fix that is tens of metres
    // out is false confidence, and it makes the number longer to read.
    distanceM: Math.round(row.distance_m),
  };
}
