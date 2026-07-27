import { Args, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/decorators/auth.decorators';
import { MarketingService } from './marketing.service';
import { FaqView, PortfolioItemView, TestimonialView } from './models/marketing.model';

/**
 * Marketing-content READS (GraphQL, per the DUAL API RULE). Writes are REST.
 *
 * Every query is @Public(): this is the content of the landing page, the first
 * thing an unauthenticated visitor sees and the whole point of the conversion
 * surface (ACC-01).
 *
 * `includeUnpublished` / `includeHidden` are the privileged corners. They are
 * accepted here but ENFORCED in the service against the optional viewer, so the
 * admin console reads its drafts through the very same query the landing page
 * uses — one code path, no chance of the public filter drifting out of sync
 * with a second admin-only resolver.
 */
@Resolver(() => FaqView)
export class MarketingResolver {
  constructor(private readonly marketing: MarketingService) {}

  @Public()
  @Query(() => [FaqView], {
    description: 'Published FAQ entries in admin-chosen order (SRS §26.2).',
  })
  async faqs(
    @CurrentUser() viewer: AuthenticatedUser | undefined,
    @Args('category', { nullable: true }) category?: string,
    @Args('includeUnpublished', {
      nullable: true,
      description: 'Admin only — includes drafts.',
    })
    includeUnpublished?: boolean,
  ): Promise<FaqView[]> {
    return this.marketing.listFaqs({ category, includeUnpublished, viewer });
  }

  @Public()
  @Query(() => [TestimonialView], {
    description:
      'Visible testimonials in admin-chosen order, each with its server-computed star row (SRS §26.2).',
  })
  async testimonials(
    @CurrentUser() viewer: AuthenticatedUser | undefined,
    @Args('includeHidden', { nullable: true, description: 'Admin only — includes hidden entries.' })
    includeHidden?: boolean,
  ): Promise<TestimonialView[]> {
    return this.marketing.listTestimonials({ includeHidden, viewer });
  }

  @Public()
  @Query(() => [PortfolioItemView], {
    description:
      'The landing page Portfolio showcase, published entries in admin-chosen order (SRS §26.2).',
  })
  async portfolio(
    @CurrentUser() viewer: AuthenticatedUser | undefined,
    @Args('includeUnpublished', {
      nullable: true,
      description: 'Admin only — includes drafts.',
    })
    includeUnpublished?: boolean,
  ): Promise<PortfolioItemView[]> {
    return this.marketing.listPortfolio({ includeUnpublished, viewer });
  }
}
