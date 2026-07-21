import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BigDataCloudClient } from './bigdatacloud.client';
import { GeoController } from './geo.controller';
import { GeoResolver } from './geo.resolver';
import { GeoService } from './geo.service';
import { LocationService } from './location.service';
import { ProximityService } from './proximity.service';
import { ReverseGeocodeService } from './reverse-geocode.service';
import { TilesController } from './tiles/tiles.controller';
import { TilesService } from './tiles/tiles.service';

/**
 * The spatial module (PROMPTS 38-41; SRS §12).
 *
 * One module for the whole layered stack — OSM, PostGIS, CARTO, BigDataCloud,
 * Mapbox — because the layers are only correct in combination. The reverse
 * geocoder decides which region a location belongs to, proximity ranks against
 * that same geometry, and the tiles render the same rows: splitting them into
 * separate modules would let three of them drift into three slightly different
 * ideas of where a worker is.
 *
 * RedisModule is @Global, so the caches here need no import.
 *
 * Exports the services other modules will need: search (PROMPT 44) ranks on
 * ProximityService, and profile management (PROMPT 48) writes through
 * LocationService so the human-pin rule cannot be bypassed by a second write
 * path.
 */
@Module({
  imports: [PrismaModule],
  controllers: [GeoController, TilesController],
  providers: [
    BigDataCloudClient,
    ReverseGeocodeService,
    LocationService,
    ProximityService,
    GeoService,
    TilesService,
    GeoResolver,
  ],
  exports: [ReverseGeocodeService, LocationService, ProximityService, GeoService],
})
export class GeoModule {}
