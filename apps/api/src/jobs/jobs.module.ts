import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { GeoModule } from '../geo/geo.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { TrustModule } from '../trust/trust.module';
import { ApplicationsService } from './applications.service';
import { ClientReliabilityService } from './client-reliability.service';
import { InvitationsService } from './invitations.service';
import { JobPostingGateService } from './job-posting-gate.service';
import { JobsController } from './jobs.controller';
import { JobsNotificationListener } from './jobs-notification.listener';
import { JobsReadService } from './jobs-read.service';
import { JobsResolver } from './jobs.resolver';
import { JobsService } from './jobs.service';

/**
 * Jobs & Applications (PROMPTS 55, 57; SRS §6 JOB-*) — the marketplace's demand
 * side.
 *
 * Imports and why:
 *   TrustModule     the Tier 2+ posting gate derives the poster's tier fresh
 *   GeoModule       a job's location resolves its region the same way a profile's
 *                   does, so job proximity and worker proximity never disagree
 *   StorageModule   job photos resolve to URLs on read
 *   BusinessModule  a job posted on a company's behalf (BIZ-02) is authorised
 *                   against that company's access levels, not against a body field
 *
 * Exports JobsService because the quotes module moves a job through QUOTED and
 * ACCEPTED as quotes arrive and are accepted — those transitions belong to the
 * job's own state machine, not to a second one invented in QuotesModule.
 */
@Module({
  imports: [PrismaModule, TrustModule, GeoModule, StorageModule, BusinessModule],
  controllers: [JobsController],
  providers: [
    JobsService,
    JobsReadService,
    ClientReliabilityService,
    JobPostingGateService,
    ApplicationsService,
    InvitationsService,
    JobsResolver,
    JobsNotificationListener,
  ],
  exports: [JobsService, JobPostingGateService],
})
export class JobsModule {}
