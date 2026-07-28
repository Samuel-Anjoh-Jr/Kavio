import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TrustModule } from '../trust/trust.module';
import { FoundingProfessionalController } from './founding.controller';
import { FoundingProfessionalService } from './founding.service';
import { IdOcrService } from './id-ocr.service';
import { IdentityTrustListener } from './identity-trust.listener';
import { VerificationController } from './verification.controller';
import { VerificationNotificationListener } from './verification-notification.listener';
import { VerificationPipelineService } from './verification-pipeline.service';
import { VerificationResolver } from './verification.resolver';
import { VerificationReviewService } from './verification-review.service';
import { DiscoveryStatusService } from './discovery-status.service';
import { VerificationService } from './verification.service';

/**
 * Progressive verification (PROMPTS 28, 29, 31; TRU-06 → TRU-09, AGT-01, AGT-03,
 * ADM-03).
 *
 * Depends on TrustModule in ONE direction only: verification reports outcomes
 * into the ledger and never reads a score back to make a decision. That is what
 * keeps the scoring rules re-tunable without re-testing the review pipeline.
 *
 * The Trust Engine, in turn, knows nothing about this module — it hears about
 * approvals as recorded events, exactly as it will hear about completed jobs and
 * released escrow in later phases.
 */
@Module({
  // No DocumentsModule: this module reads media rows directly through Prisma
  // with a kind filter the documents service does not expose, and importing it
  // for nothing would imply a dependency that is not there.
  imports: [PrismaModule, TrustModule],
  controllers: [VerificationController, FoundingProfessionalController],
  providers: [
    DiscoveryStatusService,
    VerificationService,
    VerificationReviewService,
    VerificationPipelineService,
    FoundingProfessionalService,
    IdOcrService,
    VerificationResolver,
    IdentityTrustListener,
    VerificationNotificationListener,
  ],
  exports: [VerificationService, VerificationReviewService],
})
export class VerificationModule {}
