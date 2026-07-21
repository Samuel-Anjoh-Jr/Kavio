import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { BookingsService } from './bookings.service';
import { QuotesController } from './quotes.controller';
import { QuotesNotificationListener } from './quotes-notification.listener';
import { QuotesReadService } from './quotes-read.service';
import { QuotesResolver } from './quotes.resolver';
import { QuotesService } from './quotes.service';

/**
 * Quotes, negotiation and bookings (PROMPTS 59-61; SRS §3.6 QTE-*, PAY-01 init).
 *
 * Imports JobsModule because a quote lives against a job and its lifecycle is
 * entangled with the job's: the first quote moves the job to QUOTED and accepting
 * one moves it to ACCEPTED, both through the JOB state machine JobsService owns.
 * Reusing it is what keeps a single source of truth for where a job is, rather
 * than a second copy of the rules living here.
 *
 * StorageModule resolves quote-attachment URLs on read.
 */
@Module({
  imports: [PrismaModule, JobsModule, StorageModule],
  controllers: [QuotesController],
  providers: [
    QuotesService,
    BookingsService,
    QuotesReadService,
    QuotesResolver,
    QuotesNotificationListener,
  ],
  exports: [QuotesService, BookingsService],
})
export class QuotesModule {}
