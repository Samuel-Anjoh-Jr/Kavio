import { Args, Float, ID, Int, Query, Resolver } from '@nestjs/graphql';
import { VerificationTier } from '@trustpro/database';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/auth.decorators';
import { SearchFiltersService } from './search-filters.service';
import { SearchFilterRangesView, WorkerSearchResultView } from './models/search.model';
import { SearchService } from './search.service';

/**
 * Worker search READS (GraphQL, per the DUAL API RULE).
 *
 * @Public() throughout: searching for a plumber is the first thing a visitor
 * does and the whole argument for signing up (ACC-01). Contacting the plumber is
 * where the login wall stands.
 *
 * Search is throttled harder than the global default. It is the most expensive
 * public read in the system — trigram matching plus a spatial join — and it is
 * called on a debounce as somebody types, so a modest per-minute budget still
 * covers real use while bounding what one anonymous client can spend.
 */
@Resolver()
export class SearchResolver {
  constructor(
    private readonly search: SearchService,
    private readonly filters: SearchFiltersService,
  ) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Query(() => WorkerSearchResultView, {
    description:
      'Fuzzy, taxonomy-scoped worker search ranked on relevance, proximity and trust (DIS-04…DIS-08). ALWAYS check `noProviders.reason` before rendering an empty list.',
  })
  async searchWorkers(
    @Args('query', {
      nullable: true,
      description: 'Free text. Matched fuzzily (pg_trgm) against service and category names.',
    })
    query?: string,
    @Args('latitude', { type: () => Float, nullable: true }) latitude?: number,
    @Args('longitude', { type: () => Float, nullable: true }) longitude?: number,
    @Args('radiusM', { type: () => Int, nullable: true }) radiusM?: number,
    @Args('categoryId', { type: () => ID, nullable: true }) categoryId?: string,
    @Args('categorySlug', {
      nullable: true,
      description: 'Alternative to categoryId — what shared links carry.',
    })
    categorySlug?: string,
    @Args('minPrice', {
      type: () => Int,
      nullable: true,
      description: 'XAF, on the MATCHING service.',
    })
    minPrice?: number,
    @Args('maxPrice', { type: () => Int, nullable: true }) maxPrice?: number,
    @Args('minTrustScore', { type: () => Int, nullable: true }) minTrustScore?: number,
    @Args('minTier', { type: () => VerificationTier, nullable: true }) minTier?: VerificationTier,
    @Args('minRating', {
      type: () => Float,
      nullable: true,
      description: 'Excludes unrated workers — see filterRanges.ratedWorkerCount.',
    })
    minRating?: number,
    @Args('verifiedOnly', {
      nullable: true,
      description: 'Tier 2 and above: a staff-approved ID, not merely a confirmed phone.',
    })
    verifiedOnly?: boolean,
    @Args('availableDay', {
      type: () => Int,
      nullable: true,
      description: '0 = Sunday … 6 = Saturday.',
    })
    availableDay?: number,
    @Args('availableTime', { nullable: true, description: '24-hour HH:MM.' })
    availableTime?: string,
    @Args('availableDate', {
      nullable: true,
      description: 'YYYY-MM-DD — excludes workers who marked that day off.',
    })
    availableDate?: string,
    @Args('sort', { nullable: true, description: 'relevance (default), distance, trust or price.' })
    sort?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<WorkerSearchResultView> {
    return this.search.searchWorkers({
      query,
      latitude,
      longitude,
      radiusM,
      categoryId,
      categorySlug,
      minPrice,
      maxPrice,
      minTrustScore,
      minTier,
      minRating,
      verifiedOnly,
      availableDay,
      availableTime,
      availableDate,
      sort,
      limit,
      offset,
    });
  }

  @Public()
  @Query(() => SearchFilterRangesView, {
    description:
      'Filter bounds derived from live listings in the browsed area (DIS-07). Drive every slider and chip from this — never hardcode a range.',
  })
  async searchFilterRanges(
    @Args('latitude', { type: () => Float, nullable: true }) latitude?: number,
    @Args('longitude', { type: () => Float, nullable: true }) longitude?: number,
    @Args('radiusM', { type: () => Int, nullable: true }) radiusM?: number,
    @Args('categoryId', { type: () => ID, nullable: true }) categoryId?: string,
  ): Promise<SearchFilterRangesView> {
    return this.filters.filterRanges({ latitude, longitude, radiusM, categoryId });
  }
}
