import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { VerificationTier } from '@kavio/database';
import { NoProviderReason } from '../no-provider.util';

/**
 * Worker search reads (PROMPTS 44-45; DIS-04…DIS-08), GraphQL per the DUAL API
 * RULE.
 *
 * PUBLIC, like the rest of discovery: a visitor searches before they sign up,
 * and "eleven verified plumbers within 3 km" is the argument for making an
 * account. Acting on a result — contacting, saving, hiring — is where the login
 * wall stands (ACC-01).
 *
 * Exposure follows the same rule as the proximity reads: enough to decide who to
 * contact, never enough to enumerate. Results are bounded by a page size, and
 * nothing here walks the worker table.
 */

@ObjectType({ description: 'A worker matching a search, with the service that matched.' })
export class SearchWorkerView {
  @Field(() => ID)
  workerProfileId!: string;

  @Field(() => ID, { description: 'The identity behind the profile — trust attaches here.' })
  userId!: string;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => String, { nullable: true })
  avatar!: string | null;

  @Field(() => String, { nullable: true })
  headline!: string | null;

  @Field(() => String, { nullable: true })
  city!: string | null;

  @Field(() => String, { nullable: true })
  area!: string | null;

  @Field(() => String, { nullable: true, description: 'The worker’s own landmark description.' })
  landmark!: string | null;

  @Field(() => VerificationTier)
  tier!: VerificationTier;

  @Field(() => Int)
  trustScore!: number;

  @Field(() => Int)
  completedJobs!: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Null until the identity has been rated — not zero, which would read as "bad".',
  })
  averageRating!: number | null;

  @Field(() => Float, { nullable: true })
  latitude!: number | null;

  @Field(() => Float, { nullable: true })
  longitude!: number | null;

  @Field(() => Int, {
    nullable: true,
    description:
      'Metres from the search origin, measured in PostGIS. Null when the search had no origin. The client formats; it never measures.',
  })
  distanceM!: number | null;

  @Field(() => ID, { nullable: true, description: 'The service that matched the query.' })
  matchedServiceId!: string | null;

  @Field(() => String, { nullable: true })
  matchedServiceName!: string | null;

  @Field(() => ID, { nullable: true })
  matchedCategoryId!: string | null;

  @Field(() => String, { nullable: true })
  matchedCategorySlug!: string | null;

  @Field(() => Int, {
    nullable: true,
    description:
      'Cheapest MATCHING service in XAF — not the cheapest thing they do, which would misprice the result card.',
  })
  priceFrom!: number | null;

  @Field(() => Int, { description: 'How many of their services matched.' })
  matchedServiceCount!: number;

  @Field(() => Float, {
    description:
      'Blended rank in [0,1]. Exposed so the UI can explain ordering rather than assert it.',
  })
  rankScore!: number;

  @Field(() => Float, { description: 'Trigram similarity of the query to the matched service.' })
  relevance!: number;
}

@ObjectType({
  description:
    'Why a search returned nothing, and whether widening would help (DIS-06). Check this BEFORE rendering an empty list.',
})
export class NoProviderSignalView {
  @Field(() => NoProviderReason, {
    description: 'NONE when there are results. Otherwise the coded reason the UI localises.',
  })
  reason!: NoProviderReason;

  @Field(() => Int, {
    nullable: true,
    description:
      'A radius in metres that would return results. Null when widening would not help — never show a "search wider" action without it.',
  })
  suggestedRadiusM!: number | null;

  @Field(() => Int, {
    nullable: true,
    description: 'Metres to the nearest provider outside the searched radius.',
  })
  nearestProviderM!: number | null;
}

@ObjectType({ description: 'A page of search results (DIS-04…DIS-08).' })
export class WorkerSearchResultView {
  @Field(() => [SearchWorkerView])
  workers!: SearchWorkerView[];

  @Field(() => Int, { description: 'Total matches, not just this page.' })
  totalCount!: number;

  @Field(() => Int, { description: 'The radius actually used, after clamping. Show THIS.' })
  radiusM!: number;

  @Field(() => Int)
  limit!: number;

  @Field(() => Int)
  offset!: number;

  @Field({ description: 'True when another page exists.' })
  hasMore!: boolean;

  @Field(() => NoProviderSignalView, {
    description: 'Always present. `reason` is NONE when results were found.',
  })
  noProviders!: NoProviderSignalView;

  @Field(() => Int, {
    description: 'How many filters the caller applied — for the "clear" control.',
  })
  appliedFilterCount!: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived filter ranges (DIS-07)
// ─────────────────────────────────────────────────────────────────────────────

@ObjectType({
  description:
    'Price bounds derived from live listings. Percentiles included because min/max alone make an unusable slider.',
})
export class PriceRangeView {
  @Field(() => Int, { nullable: true, description: 'Cheapest listing in scope, XAF.' })
  min!: number | null;

  @Field(() => Int, { nullable: true })
  max!: number | null;

  @Field(() => Int, {
    nullable: true,
    description: 'Sensible default lower handle — one outlier should not flatten the slider.',
  })
  p25!: number | null;

  @Field(() => Int, { nullable: true })
  p75!: number | null;

  @Field(() => Int, { description: 'Listings that actually carry a price.' })
  pricedServiceCount!: number;
}

@ObjectType({ description: 'A category with how many workers offer it in the browsed area.' })
export class CategoryFacetView {
  @Field(() => ID)
  categoryId!: string;

  @Field()
  slug!: string;

  @Field()
  nameEn!: string;

  @Field()
  nameFr!: string;

  @Field(() => String, { nullable: true })
  icon!: string | null;

  @Field(() => ID, { nullable: true })
  parentId!: string | null;

  @Field(() => Int, {
    description:
      'Workers reachable here. Zero is RETURNED rather than omitted — "not yet" is a real answer, and hiding the chip makes the trade look unknown.',
  })
  workerCount!: number;
}

@ObjectType({
  description:
    'Filter bounds derived from the data in the browsed area (DIS-07). Never hardcode these client-side.',
})
export class SearchFilterRangesView {
  @Field(() => PriceRangeView)
  price!: PriceRangeView;

  @Field(() => Int, { description: 'Lowest Trust Score present in scope.' })
  trustScoreMin!: number;

  @Field(() => Int)
  trustScoreMax!: number;

  @Field(() => Float, { nullable: true })
  ratingMin!: number | null;

  @Field(() => Float, { nullable: true })
  ratingMax!: number | null;

  @Field(() => Int, {
    description:
      'Workers carrying a rating at all. Hide the rating filter while this is 0 — it can only ever return nothing.',
  })
  ratedWorkerCount!: number;

  @Field(() => Int, { description: 'Workers at Tier 2 or above — what "verified" filters to.' })
  verifiedWorkerCount!: number;

  @Field(() => Int, { description: 'Workers in scope in total.' })
  workerCount!: number;

  @Field(() => Int, {
    nullable: true,
    description:
      'Distance to the farthest worker in scope, so the radius slider can end somewhere real.',
  })
  farthestMatchM!: number | null;

  @Field(() => [CategoryFacetView], { description: 'Per-category counts for the filter chips.' })
  categories!: CategoryFacetView[];

  @Field({
    description:
      'False while no data source can answer a response-time filter. The messaging module (Phase 5) is what turns this on — until then the control must not be rendered, because it could only ever be a no-op.',
  })
  responseTimeAvailable!: boolean;
}
