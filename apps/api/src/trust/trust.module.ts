import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BadgeService } from './badges/badge.service';
import { EndorsementResolver } from './endorsements/endorsement.resolver';
import { EndorsementService } from './endorsements/endorsement.service';
import { EndorsementsController } from './endorsements/endorsements.controller';
import { TierService } from './tier.service';
import { TrustAdjustmentService } from './trust-adjustment.service';
import { TrustAdminController } from './trust-admin.controller';
import { TrustHistoryService } from './trust-history.service';
import { TrustNotificationListener } from './trust-notification.listener';
import { TrustResolver } from './trust.resolver';
import { TrustScoreService } from './trust-score.service';
import { TrustService } from './trust.service';

/**
 * The Trust Engine (SRS §6 TRU-*, §21) — the platform's moat.
 *
 * Exports the services other modules need:
 *   TrustScoreService  record what happened; the score follows
 *   TierService        ask what tier an identity has earned
 *   BadgeService       award a milestone the rules cannot infer (founding intake)
 *
 * Deliberately NOT exported: anything that could set a score or a tier directly.
 * Verification, jobs, reviews and payments all report facts into the ledger and
 * let the model decide what they are worth.
 *
 * Endorsements and badges live HERE rather than in their own modules because
 * both are scoring concerns: an endorsement's whole meaning is its capped,
 * tapering contribution, and a badge is a milestone in the same ledger. Splitting
 * them out would put the rule and the thing it governs in different places.
 */
@Module({
  imports: [PrismaModule],
  controllers: [EndorsementsController, TrustAdminController],
  providers: [
    TrustScoreService,
    TierService,
    TrustService,
    TrustHistoryService,
    TrustAdjustmentService,
    BadgeService,
    EndorsementService,
    TrustResolver,
    EndorsementResolver,
    TrustNotificationListener,
  ],
  exports: [TrustScoreService, TierService, TrustService, BadgeService, EndorsementService],
})
export class TrustModule {}
