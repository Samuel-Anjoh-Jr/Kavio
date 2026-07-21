import { Injectable } from '@nestjs/common';
import { clampRadius, isValidCoordinates } from '../geo/coordinates.util';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { VERIFIED_MIN_TIER } from './search.config';

const logger = createLogger('search.filters');

const SLOW_QUERY_MS = 300;

export interface FilterRangesQuery {
  latitude?: number | null;
  longitude?: number | null;
  radiusM?: number | null;
  categoryId?: string | null;
}

export interface CategoryFacet {
  categoryId: string;
  slug: string;
  nameEn: string;
  nameFr: string;
  icon: string | null;
  parentId: string | null;
  workerCount: number;
}

export interface SearchFilterRanges {
  price: {
    min: number | null;
    max: number | null;
    p25: number | null;
    p75: number | null;
    pricedServiceCount: number;
  };
  trustScoreMin: number;
  trustScoreMax: number;
  ratingMin: number | null;
  ratingMax: number | null;
  ratedWorkerCount: number;
  verifiedWorkerCount: number;
  workerCount: number;
  farthestMatchM: number | null;
  categories: CategoryFacet[];
  responseTimeAvailable: boolean;
}

interface FilterRangesRow {
  price_min: number | null;
  price_max: number | null;
  price_p25: number | null;
  price_p75: number | null;
  priced_service_count: bigint;
  trust_score_min: number | null;
  trust_score_max: number | null;
  rating_min: unknown;
  rating_max: unknown;
  rated_worker_count: bigint;
  verified_worker_count: bigint;
  worker_count: bigint;
  farthest_match_m: number | null;
}

interface CategoryFacetRow {
  category_id: string;
  slug: string;
  name_en: string;
  name_fr: string;
  icon: string | null;
  parent_id: string | null;
  worker_count: bigint;
}

/**
 * Filter bounds, DERIVED from live listings (PROMPT 45; DIS-07).
 *
 * "Ranges are derived from data, never hardcoded" is the requirement, and the
 * reason is practical rather than tidy: a price slider whose ceiling is a
 * developer's guess is either unusable — every listing bunched against the left
 * edge — or it silently excludes the expensive half of the market from ever
 * being seen. The same applies to a rating filter in a marketplace where nobody
 * has been rated yet: the honest move is to tell the client so it can hide the
 * control, not to offer a filter that can only return nothing.
 *
 * ── One filter is deliberately NOT here ────────────────────────────────────
 * DIS-07 lists response time. Nothing in the system can measure it yet: there is
 * no messaging module until Phase 5, so there is no first-response to time. The
 * filter is therefore ABSENT from the search arguments rather than accepted and
 * ignored, and `responseTimeAvailable` reports false so the UI does not render a
 * control that would appear to work and change nothing. It flips to true when
 * messaging lands, and no call site changes.
 */
@Injectable()
export class SearchFiltersService {
  constructor(private readonly prisma: PrismaService) {}

  async filterRanges(query: FilterRangesQuery): Promise<SearchFilterRanges> {
    const origin = this.resolveOrigin(query);
    const radiusM = clampRadius(query.radiusM);

    const started = Date.now();

    // Two statements, issued together: the scalar bounds and the per-category
    // counts have different grains, and forcing them into one query would mean
    // either a cartesian product or an aggregate over an aggregate.
    const [rangeRows, facetRows] = await Promise.all([
      this.prisma.client.$queryRaw<FilterRangesRow[]>`
        SELECT * FROM search.filter_ranges(
          ${origin?.latitude ?? null}::double precision,
          ${origin?.longitude ?? null}::double precision,
          ${radiusM}::double precision,
          ${query.categoryId ?? null}::uuid,
          ${VERIFIED_MIN_TIER}::"VerificationTier"
        )
      `,
      this.prisma.client.$queryRaw<CategoryFacetRow[]>`
        SELECT * FROM search.category_facets(
          ${origin?.latitude ?? null}::double precision,
          ${origin?.longitude ?? null}::double precision,
          ${radiusM}::double precision
        )
      `,
    ]);

    const durationMs = Date.now() - started;
    if (durationMs > SLOW_QUERY_MS) {
      logger.warn('Slow filter-range query', {
        durationMs,
        payload: { hasOrigin: origin !== null, radiusM },
      });
    }

    const row = rangeRows[0];

    return {
      price: {
        min: nullableNumber(row?.price_min),
        max: nullableNumber(row?.price_max),
        p25: nullableNumber(row?.price_p25),
        p75: nullableNumber(row?.price_p75),
        pricedServiceCount: Number(row?.priced_service_count ?? 0),
      },
      // An empty area has no minimum, so the bounds collapse to the full scale
      // rather than to null: a slider still has to render, and 0-100 is the
      // honest domain of a Trust Score when there is nobody in it.
      trustScoreMin: row?.trust_score_min ?? 0,
      trustScoreMax: row?.trust_score_max ?? 100,
      ratingMin: nullableNumber(row?.rating_min),
      ratingMax: nullableNumber(row?.rating_max),
      ratedWorkerCount: Number(row?.rated_worker_count ?? 0),
      verifiedWorkerCount: Number(row?.verified_worker_count ?? 0),
      workerCount: Number(row?.worker_count ?? 0),
      farthestMatchM:
        row?.farthest_match_m === null || row?.farthest_match_m === undefined
          ? null
          : Math.round(row.farthest_match_m),
      categories: facetRows.map((facet) => ({
        categoryId: facet.category_id,
        slug: facet.slug,
        nameEn: facet.name_en,
        nameFr: facet.name_fr,
        icon: facet.icon,
        parentId: facet.parent_id,
        workerCount: Number(facet.worker_count),
      })),
      responseTimeAvailable: false,
    };
  }

  private resolveOrigin(query: FilterRangesQuery): { latitude: number; longitude: number } | null {
    if (
      query.latitude === null ||
      query.latitude === undefined ||
      query.longitude === null ||
      query.longitude === undefined
    ) {
      return null;
    }

    const candidate = { latitude: query.latitude, longitude: query.longitude };

    // Ranges are advisory, so a bad coordinate degrades to the platform-wide
    // bounds instead of failing the request: the filter panel opening with wide
    // ranges beats it not opening at all.
    if (!isValidCoordinates(candidate)) {
      logger.warn('Ignoring invalid coordinates on a filter-range query', {
        payload: { latitude: query.latitude, longitude: query.longitude },
      });
      return null;
    }

    return candidate;
  }
}

/** Postgres NUMERIC/INTEGER arrive as Decimal-like objects or nulls. */
function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}
