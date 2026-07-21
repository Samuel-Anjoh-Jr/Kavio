import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TierService } from './tier.service';
import { TrustNotificationListener } from './trust-notification.listener';
import { TrustResolver } from './trust.resolver';
import { TrustScoreService } from './trust-score.service';
import { TrustService } from './trust.service';

/**
 * The Trust Engine (SRS §6 TRU-*, §21) — the platform's moat.
 *
 * Exports the two services other modules need:
 *   TrustScoreService  record what happened; the score follows
 *   TierService        ask what tier an identity has earned
 *
 * Deliberately NOT exported: anything that could set a score or a tier directly.
 * Verification, jobs, reviews and payments all report facts into the ledger and
 * let the model decide what they are worth.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    TrustScoreService,
    TierService,
    TrustService,
    TrustResolver,
    TrustNotificationListener,
  ],
  exports: [TrustScoreService, TierService, TrustService],
})
export class TrustModule {}
