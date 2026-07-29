import { Args, Float, ID, Int, Query, Resolver } from '@nestjs/graphql';
import { GeoRegionLevel } from '@kavio/database';
import { Public } from '../auth/decorators/auth.decorators';
import { GeoService } from './geo.service';
import {
  GeoRegionView,
  LandmarkView,
  NearbyWorkersView,
  ResolvedPlaceView,
} from './models/geo.model';
import { ProximityService } from './proximity.service';
import { ReverseGeocodeService } from './reverse-geocode.service';

/**
 * Spatial READS (PROMPTS 38-40), GraphQL-only per the DUAL API RULE. Setting a
 * location is a REST write on GeoController.
 *
 * Every query here is @Public(). That is the ACCESS MODEL, not an oversight: an
 * unauthenticated visitor must be able to set a location and see who is nearby,
 * because "there are twelve verified electricians within 3 km of you" is the
 * argument for signing up. Acting on a result — contacting, saving, hiring —
 * is where the login wall stands.
 *
 * These endpoints are rate-limited by the global ThrottlerGuard.
 */
@Resolver()
export class GeoResolver {
  constructor(
    private readonly geo: GeoService,
    private readonly proximity: ProximityService,
    private readonly reverseGeocode: ReverseGeocodeService,
  ) {}

  @Public()
  @Query(() => ResolvedPlaceView, {
    description:
      'Resolves coordinates to an administrative area (DIS-09). Repeat lookups from the same block are served from cache.',
  })
  async reverseGeocodeLocation(
    @Args('latitude', { type: () => Float }) latitude: number,
    @Args('longitude', { type: () => Float }) longitude: number,
    @Args('locale', { nullable: true }) locale?: string,
  ): Promise<ResolvedPlaceView> {
    return this.reverseGeocode.resolve({ latitude, longitude }, locale);
  }

  @Public()
  @Query(() => NearbyWorkersView, {
    description:
      'Workers within a radius of a point, distance-ranked in PostGIS (DIS-07). Check `noProvidersInArea` before rendering an empty list (DIS-06).',
  })
  async nearbyWorkers(
    @Args('latitude', { type: () => Float }) latitude: number,
    @Args('longitude', { type: () => Float }) longitude: number,
    @Args('radiusM', { type: () => Int, nullable: true }) radiusM?: number,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
    @Args('categoryId', { type: () => ID, nullable: true }) categoryId?: string,
    @Args('minTrustScore', { type: () => Int, nullable: true }) minTrustScore?: number,
    @Args('regionId', { type: () => ID, nullable: true }) regionId?: string,
  ): Promise<NearbyWorkersView> {
    return this.proximity.nearbyWorkers({
      latitude,
      longitude,
      radiusM,
      limit,
      offset,
      categoryId,
      minTrustScore,
      regionId,
    });
  }

  @Public()
  @Query(() => [GeoRegionView], {
    description: 'Active administrative regions, for the location picker.',
  })
  async geoRegions(
    @Args('level', { type: () => GeoRegionLevel, nullable: true }) level?: GeoRegionLevel,
    @Args('parentId', { type: () => ID, nullable: true }) parentId?: string,
  ): Promise<GeoRegionView[]> {
    return this.geo.regions({ level, parentId });
  }

  @Public()
  @Query(() => [LandmarkView], {
    description:
      'Named OSM landmarks near a point, nearest first — for describing a location the way people here actually do.',
  })
  async nearbyLandmarks(
    @Args('latitude', { type: () => Float }) latitude: number,
    @Args('longitude', { type: () => Float }) longitude: number,
    @Args('radiusM', { type: () => Int, nullable: true }) radiusM?: number,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<LandmarkView[]> {
    return this.geo.nearbyLandmarks({ latitude, longitude }, radiusM, limit);
  }
}
