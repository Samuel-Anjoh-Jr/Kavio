import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeaturedController } from './featured.controller';
import { FeaturedNotificationListener } from './featured-notification.listener';
import { FeaturedResolver } from './featured.resolver';
import { FeaturedService } from './featured.service';

/**
 * Sponsored ranking placement (business plan: "Featured/Verified Business
 * tier").
 *
 * Exports FeaturedService: QuotesModule reads it on the hot path of accepting
 * a quote (the extra commission folds into the platform fee), and SearchModule
 * reads it to decide which matches carry the "Sponsored" tag. Both are simple
 * fact lookups against this module's own table — the reverse dependency never
 * happens, so a role switch or a ranking tweak can never touch a listing.
 */
@Module({
  imports: [PrismaModule],
  controllers: [FeaturedController],
  providers: [FeaturedService, FeaturedResolver, FeaturedNotificationListener],
  exports: [FeaturedService],
})
export class FeaturedModule {}
