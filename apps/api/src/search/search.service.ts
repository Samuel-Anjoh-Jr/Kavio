import { HttpStatus, Injectable } from '@nestjs/common';
import type { VerificationTier } from '@kavio/database';
import { clampLimit, clampOffset, clampRadius, isValidCoordinates } from '../geo/coordinates.util';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import {
  deriveNoProviderSignal,
  NoProviderReason,
  type NoProviderSignal,
  type ProviderProbe,
} from './no-provider.util';
import { VERIFIED_MIN_TIER } from './search.config';
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, normaliseSort, weightsFor } from './search-ranking';

const logger = createLogger('search');

/** Engineering standard: a search slower than this is a bug, not a busy moment. */
const SLOW_QUERY_MS = 300;

/**
 * How close two composite scores must be to count as a tie.
 *
 * Scores are floored to a multiple of this before ranking, and everyone inside
 * a band is shuffled per viewer. Wider bands spread exposure further down the
 * list; narrower bands hew closer to a strict ranking. 0.05 on a [0,1] score
 * means roughly twenty bands — enough that a clearly better worker still wins,
 * small enough that near-equals genuinely rotate.
 */
const FAIRNESS_BAND = 0.05;

/** Longest viewer seed we will hash. Anything longer is a client bug or abuse. */
const MAX_SEED_LENGTH = 128;

export interface WorkerSearchQuery {
  query?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusM?: number | null;
  categoryId?: string | null;
  categorySlug?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  minTrustScore?: number | null;
  minTier?: VerificationTier | null;
  minRating?: number | null;
  verifiedOnly?: boolean | null;
  availableDay?: number | null;
  availableTime?: string | null;
  availableDate?: string | null;
  sort?: string | null;
  limit?: number | null;
  offset?: number | null;
  /**
   * Stable per-device key used to shuffle equally-ranked workers. Bounded and
   * stripped here rather than trusted: it reaches a hash function in SQL, and
   * an unbounded client-supplied string has no business doing that.
   */
  viewerSeed?: string | null;
}

export interface SearchWorker {
  workerProfileId: string;
  userId: string;
  name: string | null;
  avatar: string | null;
  headline: string | null;
  city: string | null;
  area: string | null;
  landmark: string | null;
  tier: VerificationTier;
  trustScore: number;
  completedJobs: number;
  averageRating: number | null;
  latitude: number | null;
  longitude: number | null;
  distanceM: number | null;
  matchedServiceId: string | null;
  matchedServiceName: string | null;
  matchedCategoryId: string | null;
  matchedCategorySlug: string | null;
  priceFrom: number | null;
  matchedServiceCount: number;
  relevance: number;
  rankScore: number;
}

export interface WorkerSearchResult {
  workers: SearchWorker[];
  totalCount: number;
  radiusM: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  noProviders: NoProviderSignal;
  appliedFilterCount: number;
}

/** Row shape from search.workers — snake_case, straight out of SQL. */
interface SearchWorkerRow {
  worker_profile_id: string;
  user_id: string;
  name: string | null;
  avatar: string | null;
  headline: string | null;
  city: string | null;
  area: string | null;
  landmark: string | null;
  tier: VerificationTier;
  trust_score: number;
  completed_jobs: number;
  average_rating: unknown;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;
  matched_service_id: string | null;
  matched_service_name: string | null;
  matched_category_id: string | null;
  matched_category_slug: string | null;
  price_from: number | null;
  matched_service_count: number;
  relevance: number;
  proximity: number;
  trust_rank: number;
  rank_score: number;
  total_count: bigint;
}

interface ProviderProbeRow {
  matches_anywhere: bigint;
  matches_in_area: bigint;
  nearest_match_m: number | null;
}

/**
 * Worker search (PROMPTS 44-45; DIS-04…DIS-08).
 *
 * Matching, ranking and filtering all happen in `search.workers()` — a reviewed
 * SQL function — for the same reason proximity does: the three have to agree
 * with each other, and they only do while one engine decides all three. This
 * class validates, clamps, chooses the ranking weights and maps the rows.
 *
 * It performs at most TWO round trips: the search itself, and — only when that
 * came back empty — the probe that decides WHY (DIS-06). The probe is never run
 * on a successful search, which is the common case.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async searchWorkers(query: WorkerSearchQuery): Promise<WorkerSearchResult> {
    const text = this.normaliseQuery(query.query);
    const origin = this.resolveOrigin(query);
    const radiusM = clampRadius(query.radiusM);
    const limit = clampLimit(query.limit);
    const offset = clampOffset(query.offset);
    const sort = normaliseSort(query.sort);
    const weights = weightsFor(origin !== null);
    const viewerSeed = this.normaliseViewerSeed(query.viewerSeed);

    const categoryId = await this.resolveCategoryId(query);
    const priceRange = this.normalisePriceRange(query.minPrice, query.maxPrice);
    const availability = this.normaliseAvailability(query);

    const started = Date.now();

    const rows = await this.prisma.client.$queryRaw<SearchWorkerRow[]>`
      SELECT * FROM search.workers(
        ${text}::text,
        ${origin?.latitude ?? null}::double precision,
        ${origin?.longitude ?? null}::double precision,
        ${radiusM}::double precision,
        ${categoryId}::uuid,
        ${priceRange.min}::integer,
        ${priceRange.max}::integer,
        ${query.minTrustScore ?? null}::integer,
        ${query.minTier ?? null}::"VerificationTier",
        ${query.minRating ?? null}::numeric,
        ${query.verifiedOnly ?? false}::boolean,
        ${VERIFIED_MIN_TIER}::"VerificationTier",
        ${availability.day}::integer,
        ${availability.time}::text,
        ${availability.date}::date,
        ${weights.relevance}::real,
        ${weights.proximity}::real,
        ${weights.trust}::real,
        ${sort}::text,
        ${limit}::integer,
        ${offset}::integer,
        ${viewerSeed}::text,
        ${FAIRNESS_BAND}::real
      )
    `;

    const durationMs = Date.now() - started;
    if (durationMs > SLOW_QUERY_MS) {
      logger.warn('Slow worker search', {
        durationMs,
        payload: {
          hasQuery: text !== null,
          hasOrigin: origin !== null,
          hasCategory: categoryId !== null,
          sort,
          limit,
          offset,
        },
      });
    }

    // `total_count` is a window over the matched set, so it is identical on every
    // row — and absent entirely when nothing matched.
    const totalCount = rows.length > 0 ? Number(rows[0]?.total_count ?? 0) : 0;
    const appliedFilterCount = this.countAppliedFilters(query, categoryId);

    const noProviders =
      totalCount === 0 && offset === 0
        ? await this.explainEmptyResult({
            text,
            origin,
            radiusM,
            categoryId,
            appliedFilterCount,
          })
        : {
            reason: NoProviderReason.NONE,
            suggestedRadiusM: null,
            nearestProviderM: null,
          };

    return {
      workers: rows.map(toSearchWorker),
      totalCount,
      radiusM,
      limit,
      offset,
      hasMore: offset + rows.length < totalCount,
      noProviders,
      appliedFilterCount,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Explains an empty page (DIS-06).
   *
   * Only ever called on page one with zero results. An empty page five means the
   * caller walked off the end of a result set that DOES have providers, and
   * telling them "no providers in your area" there would be nonsense.
   */
  private async explainEmptyResult(input: {
    text: string | null;
    origin: { latitude: number; longitude: number } | null;
    radiusM: number;
    categoryId: string | null;
    appliedFilterCount: number;
  }): Promise<NoProviderSignal> {
    const rows = await this.prisma.client.$queryRaw<ProviderProbeRow[]>`
      SELECT * FROM search.provider_probe(
        ${input.text}::text,
        ${input.origin?.latitude ?? null}::double precision,
        ${input.origin?.longitude ?? null}::double precision,
        ${input.radiusM}::double precision,
        ${input.categoryId}::uuid
      )
    `;

    const row = rows[0];

    const probe: ProviderProbe = {
      matchesAnywhere: Number(row?.matches_anywhere ?? 0),
      matchesInArea: Number(row?.matches_in_area ?? 0),
      nearestMatchM: row?.nearest_match_m === null ? null : Number(row?.nearest_match_m ?? 0),
    };

    const signal = deriveNoProviderSignal({
      resultCount: 0,
      probe,
      hasFilters: input.appliedFilterCount > 0,
      hasLocation: input.origin !== null,
    });

    logger.info('Search returned no results', {
      payload: {
        reason: signal.reason,
        matchesAnywhere: probe.matchesAnywhere,
        matchesInArea: probe.matchesInArea,
        appliedFilterCount: input.appliedFilterCount,
      },
    });

    return signal;
  }

  /**
   * Trims the query and enforces a length floor.
   *
   * Below the floor the query is dropped to null — a BROWSE — rather than
   * rejected. Someone who has typed one letter is mid-thought, and an error
   * message under the search box while they type is hostile.
   */
  private normaliseQuery(raw: string | null | undefined): string | null {
    const trimmed = (raw ?? '').trim();

    if (trimmed.length === 0 || trimmed.length < MIN_QUERY_LENGTH) {
      return null;
    }

    return trimmed.slice(0, MAX_QUERY_LENGTH);
  }

  /**
   * Bounds and sanitises the per-viewer shuffle key.
   *
   * An empty seed is a legitimate answer, not a failure: it means "rank
   * strictly", which is what a crawler or a server-side render without a device
   * id should get. Non-alphanumerics are stripped so the value that reaches
   * hashtext() is a plain token regardless of what the client sent.
   */
  private normaliseViewerSeed(raw: string | null | undefined): string {
    return (raw ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, MAX_SEED_LENGTH);
  }

  /**
   * A search origin is OPTIONAL.
   *
   * A guest who has not granted geolocation must still get results — ranked on
   * relevance and trust alone — because demanding a location before showing
   * anything is exactly the wall the guest-first interface exists to remove.
   */
  private resolveOrigin(query: WorkerSearchQuery): { latitude: number; longitude: number } | null {
    if (query.latitude === null || query.latitude === undefined) {
      return null;
    }
    if (query.longitude === null || query.longitude === undefined) {
      return null;
    }

    const candidate = { latitude: query.latitude, longitude: query.longitude };

    if (!isValidCoordinates(candidate)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_COORDINATES',
        'That location does not look right.',
        { latitude: ['Send a valid latitude and longitude, or neither.'] },
      );
    }

    return candidate;
  }

  /** Accepts a category by id or by slug — the slug is what shared links carry. */
  private async resolveCategoryId(query: WorkerSearchQuery): Promise<string | null> {
    if (query.categoryId) {
      return query.categoryId;
    }

    if (!query.categorySlug) {
      return null;
    }

    const category = await this.prisma.client.serviceCategory.findUnique({
      where: { slug: query.categorySlug },
      select: { id: true },
    });

    if (!category) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'CATEGORY_NOT_FOUND',
        'That service category does not exist.',
        { categorySlug: ['Choose a category from the list.'] },
      );
    }

    return category.id;
  }

  /**
   * Swaps an inverted price range rather than returning nothing.
   *
   * min > max can only ever match zero rows, and a range slider dragged past
   * itself is a UI accident, not a request for an empty page.
   */
  private normalisePriceRange(
    min: number | null | undefined,
    max: number | null | undefined,
  ): { min: number | null; max: number | null } {
    const low = min ?? null;
    const high = max ?? null;

    if (low !== null && high !== null && low > high) {
      return { min: high, max: low };
    }

    return { min: low, max: high };
  }

  private normaliseAvailability(query: WorkerSearchQuery): {
    day: number | null;
    time: string | null;
    date: string | null;
  } {
    const day = query.availableDay ?? null;

    if (day !== null && (!Number.isInteger(day) || day < 0 || day > 6)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_DAY_OF_WEEK',
        'Choose a day of the week.',
        { availableDay: ['Use 0 (Sunday) through 6 (Saturday).'] },
      );
    }

    const time = query.availableTime ?? null;

    if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_TIME', 'Choose a valid time.', {
        availableTime: ['Use 24-hour HH:MM, such as 14:30.'],
      });
    }

    const date = query.availableDate ?? null;

    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_DATE', 'Choose a valid date.', {
        availableDate: ['Use YYYY-MM-DD.'],
      });
    }

    return { day, time, date };
  }

  /**
   * How many filters the caller applied.
   *
   * DIS-07 requires the active filter count on the apply control, and counting
   * it server-side means every surface shows the same number as the query that
   * actually ran. The text query and the location are NOT filters — they are the
   * search itself.
   */
  private countAppliedFilters(query: WorkerSearchQuery, categoryId: string | null): number {
    const flags = [
      categoryId !== null,
      query.minPrice !== null && query.minPrice !== undefined,
      query.maxPrice !== null && query.maxPrice !== undefined,
      query.minTrustScore !== null && query.minTrustScore !== undefined,
      query.minTier !== null && query.minTier !== undefined,
      query.minRating !== null && query.minRating !== undefined,
      query.verifiedOnly === true,
      query.availableDay !== null && query.availableDay !== undefined,
    ];

    return flags.filter(Boolean).length;
  }
}

function toSearchWorker(row: SearchWorkerRow): SearchWorker {
  return {
    workerProfileId: row.worker_profile_id,
    userId: row.user_id,
    name: row.name,
    avatar: row.avatar,
    headline: row.headline,
    city: row.city,
    area: row.area,
    landmark: row.landmark,
    tier: row.tier,
    trustScore: Number(row.trust_score),
    completedJobs: Number(row.completed_jobs),
    // Postgres NUMERIC arrives as a Decimal-like object, never a JS number.
    averageRating: row.average_rating === null ? null : Number(row.average_rating),
    latitude: row.latitude,
    longitude: row.longitude,
    // Metres, rounded. Sub-metre precision on a GPS fix that is tens of metres
    // out is false confidence, and it makes the number longer to read.
    distanceM: row.distance_m === null ? null : Math.round(row.distance_m),
    matchedServiceId: row.matched_service_id,
    matchedServiceName: row.matched_service_name,
    matchedCategoryId: row.matched_category_id,
    matchedCategorySlug: row.matched_category_slug,
    priceFrom: row.price_from === null ? null : Number(row.price_from),
    matchedServiceCount: Number(row.matched_service_count),
    relevance: Number(row.relevance),
    rankScore: Number(row.rank_score),
  };
}
