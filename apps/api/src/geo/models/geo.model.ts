import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { GeoRegionLevel, VerificationTier } from '@kavio/database';

/**
 * Spatial reads (PROMPTS 38-40), served over GraphQL per the DUAL API RULE.
 *
 * These types are PUBLIC: the guest first-interface lets an unauthenticated
 * visitor search for workers near them, which is how the platform proves it has
 * anyone at all before asking for a sign-up.
 *
 * What that means for what is exposed here: a worker's position is returned at
 * the precision they set it, because a client genuinely needs to know whether
 * the plumber is in Akwa or Bonabéri before contacting them. What is NOT
 * exposed is any way to enumerate: results are bounded by a radius and a page
 * size, and there is no query that walks the whole worker table by geography.
 * The vector-tile layer (PROMPT 41) is aggregate-only for the same reason.
 *
 * Distances are always METRES from the server. The client formats; it never
 * measures (SRS §12).
 */

@ObjectType({ description: 'An administrative area (SRS §12).' })
export class GeoRegionView {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'Stable key used by saved filters and shared links.' })
  slug!: string;

  @Field()
  nameEn!: string;

  @Field()
  nameFr!: string;

  @Field(() => GeoRegionLevel)
  level!: GeoRegionLevel;

  @Field(() => ID, { nullable: true })
  parentId!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Parent’s English name, so a quarter renders as “Akwa, Douala”.',
  })
  parentNameEn!: string | null;

  @Field(() => String, { nullable: true })
  parentNameFr!: string | null;

  @Field(() => Float, { nullable: true, description: 'Centroid latitude.' })
  latitude!: number | null;

  @Field(() => Float, { nullable: true, description: 'Centroid longitude.' })
  longitude!: number | null;

  @Field({
    description:
      'True when this boundary came from OSM. False means it is still the coarse seeded approximation — say so rather than implying precision we do not have.',
  })
  boundaryIsAuthoritative!: boolean;
}

@ObjectType({ description: 'The administrative area a coordinate resolves to (DIS-09).' })
export class ResolvedPlaceView {
  @Field(() => ID, { nullable: true, description: 'GeoRegion the point falls inside, if any.' })
  regionId!: string | null;

  @Field(() => String, { nullable: true })
  regionSlug!: string | null;

  @Field(() => GeoRegionLevel, { nullable: true })
  regionLevel!: GeoRegionLevel | null;

  @Field(() => String, { nullable: true, description: 'Most local name available, localised.' })
  locality!: string | null;

  @Field(() => String, { nullable: true })
  city!: string | null;

  @Field(() => String, { nullable: true, description: 'Province or region.' })
  principalSubdivision!: string | null;

  @Field(() => String, { nullable: true })
  countryCode!: string | null;

  @Field({
    description:
      'Where the answer came from: cache, postgis, bigdatacloud, or unresolved. Surfaced so the UI can offer a manual pin when we genuinely do not know.',
  })
  source!: string;
}

@ObjectType({ description: 'A worker found near a point, with server-computed distance.' })
export class NearbyWorkerView {
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

  @Field(() => String, {
    nullable: true,
    description: 'The worker’s own landmark note — how an address is actually given here.',
  })
  landmark!: string | null;

  @Field(() => String, { nullable: true })
  regionSlug!: string | null;

  @Field(() => String, { nullable: true })
  regionNameEn!: string | null;

  @Field(() => String, { nullable: true })
  regionNameFr!: string | null;

  @Field(() => VerificationTier)
  tier!: VerificationTier;

  @Field(() => Int)
  trustScore!: number;

  @Field(() => Int)
  completedJobs!: number;

  @Field(() => Float, { nullable: true })
  averageRating!: number | null;

  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;

  @Field(() => Int, { description: 'Metres from the search point, computed in PostGIS.' })
  distanceM!: number;
}

@ObjectType({ description: 'A page of distance-ranked workers (DIS-06, DIS-07).' })
export class NearbyWorkersView {
  @Field(() => [NearbyWorkerView])
  workers!: NearbyWorkerView[];

  @Field(() => Int, { description: 'Total matches in the radius, not just this page.' })
  totalCount!: number;

  @Field(() => Int, { description: 'The radius actually applied, after clamping. Show THIS.' })
  radiusM!: number;

  @Field({
    description:
      'True when the search was valid and found nobody. Render the friendly “no providers here yet” message (DIS-06), never a bare empty list.',
  })
  noProvidersInArea!: boolean;
}

@ObjectType({ description: 'A named OSM point of interest, for landmark-based addressing.' })
export class LandmarkView {
  @Field(() => String, { description: 'OSM element id, as a string — it exceeds Int.' })
  osmId!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true, description: 'OSM category: fuel, pharmacy, bank…' })
  category!: string | null;

  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;

  @Field(() => Int)
  distanceM!: number;
}
