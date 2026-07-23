import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketingController } from './marketing.controller';
import { MarketingResolver } from './marketing.resolver';
import { MarketingService } from './marketing.service';

/**
 * Marketing content: the landing page's FAQ and testimonials (PROMPT 92.1;
 * SRS §26.2).
 *
 * Its own module rather than a corner of AdminModule, even though its writes are
 * admin-only. AdminModule is deliberately read-only across the other domains —
 * the admin surfaces that WRITE live in the module that owns the domain and its
 * rules. This content is a domain of its own (nothing else references it), so it
 * owns both sides here.
 *
 * Depends on nothing but Prisma, and nothing depends on it. That is the shape of
 * a leaf: marketing copy must never become something the marketplace reads.
 */
@Module({
  imports: [PrismaModule],
  controllers: [MarketingController],
  providers: [MarketingService, MarketingResolver],
  exports: [MarketingService],
})
export class MarketingModule {}
