import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { TrustModule } from '../trust/trust.module';
import { AvailabilityService } from './availability.service';
import { BusinessProfileService } from './business-profile.service';
import { PortfolioService } from './portfolio.service';
import { ProfileEditService } from './profile-edit.service';
import { ProfileOwnershipService } from './profile-ownership.service';
import { ProfilesController } from './profiles.controller';
import { ProfilesResolver } from './profiles.resolver';
import { WorkerProfileService } from './worker-profile.service';
import { WorkerServicesService } from './worker-services.service';

/**
 * Worker and business profiles: reads and owner edits (PROMPTS 46-48).
 *
 * One module for reading a profile and editing it, because the two are the same
 * data seen from either side, and splitting them would put the shape of a
 * profile in one place and the rules for changing it in another.
 *
 * Imports and why:
 *   CatalogModule  a worker may only file a service under a live category
 *   StorageModule  portfolio media, covers and logos resolve to URLs through it
 *   TrustModule    the first portfolio item is a scored trust event (§21.5)
 */
@Module({
  imports: [PrismaModule, StorageModule, CatalogModule, TrustModule, GeoModule],
  controllers: [ProfilesController],
  providers: [
    ProfileOwnershipService,
    WorkerProfileService,
    BusinessProfileService,
    WorkerServicesService,
    PortfolioService,
    AvailabilityService,
    ProfileEditService,
    ProfilesResolver,
  ],
  exports: [WorkerProfileService, BusinessProfileService],
})
export class ProfilesModule {}
