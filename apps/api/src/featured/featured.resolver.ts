import { Query, Resolver } from '@nestjs/graphql';
import { Role } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators/auth.decorators';
import { FeaturedService } from './featured.service';
import { FeaturedListingView, FeaturedQueueItemView } from './models/featured.model';

/**
 * Sponsored ranking placement reads (business plan: "Featured/Verified
 * Business tier"), GraphQL-only per the DUAL API RULE.
 *
 * Nothing here is @Public(): whether an identity is featured is visible on the
 * search result itself (the `sponsored` flag), but the underlying request/
 * review record is not — a stranger sees the badge, not the commission a
 * business is paying for it.
 */
@Resolver()
export class FeaturedResolver {
  constructor(private readonly featured: FeaturedService) {}

  @Query(() => FeaturedListingView, {
    nullable: true,
    description: 'The signed-in identity’s own featured-placement request, or null.',
  })
  async myFeaturedStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FeaturedListingView | null> {
    return this.featured.statusFor(user.id);
  }

  @Roles(Role.ADMIN)
  @Query(() => [FeaturedQueueItemView], {
    description: 'The admin review queue for featured-placement requests, oldest first.',
  })
  async featuredListingRequests(): Promise<FeaturedQueueItemView[]> {
    return this.featured.listPending();
  }
}
