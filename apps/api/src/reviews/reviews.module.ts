import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { TrustModule } from '../trust/trust.module';
import { ReviewNotificationListener } from './review-notification.listener';
import { ReviewsController } from './reviews.controller';
import { ReviewsReadService } from './reviews-read.service';
import { ReviewsResolver } from './reviews.resolver';
import { ReviewsService } from './reviews.service';

/**
 * Reviews (PROMPT 79; REV-01, REV-02, REV-03).
 *
 * Writes are REST (ReviewsController), reads are GraphQL (ReviewsResolver) — the
 * DUAL API RULE. TrustModule supplies the ledger a qualifying review reports
 * into; StorageModule resolves the signed URLs for review photos on read.
 *
 * Reporting has no service of its own here: a reported review becomes an
 * AbuseReport with targetType REVIEW, so it lands in the one moderation
 * workspace (ADM-08) rather than in a queue only reviews know about.
 */
@Module({
  imports: [PrismaModule, StorageModule, TrustModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewsReadService, ReviewsResolver, ReviewNotificationListener],
  exports: [ReviewsService, ReviewsReadService],
})
export class ReviewsModule {}
