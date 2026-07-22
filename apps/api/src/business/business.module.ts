import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TrustModule } from '../trust/trust.module';
import { VerificationModule } from '../verification/verification.module';
import { BusinessAccessService } from './business-access.service';
import { BusinessAnalyticsService } from './business-analytics.service';
import { BusinessController } from './business.controller';
import { BusinessResolver } from './business.resolver';
import { BusinessVerificationService } from './business-verification.service';
import { TeamNotificationListener } from './team-notification.listener';
import { TeamService } from './team.service';

/**
 * Business, teams and corporate eligibility (PROMPT 81; BIZ-01…BIZ-04).
 *
 * Writes are REST (BusinessController), reads are GraphQL (BusinessResolver) —
 * the DUAL API RULE.
 *
 * VerificationModule supplies the pipeline the RCCM check rides: business papers
 * go through the SAME queue, audit trail and coded rejection reasons as an ID,
 * rather than a private approval flow. TrustModule supplies the badge registry
 * the Verified Business badge is awarded through.
 *
 * BusinessAccessService is exported because it is the answer to "may this
 * identity act for this company?", which JobsModule needs in order to accept a
 * team job posted on a company's behalf (BIZ-02).
 */
@Module({
  imports: [PrismaModule, TrustModule, VerificationModule],
  controllers: [BusinessController],
  providers: [
    BusinessAccessService,
    BusinessAnalyticsService,
    BusinessVerificationService,
    TeamService,
    BusinessResolver,
    TeamNotificationListener,
  ],
  exports: [BusinessAccessService],
})
export class BusinessModule {}
