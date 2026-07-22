import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/decorators/auth.decorators';
import { ReviewsReadService } from './reviews-read.service';
import { ReviewsService } from './reviews.service';
import {
  ReviewEligibilityView,
  ReviewListItemView,
  ReviewSummaryView,
} from './models/review.model';

/**
 * Review reads (REV-02), GraphQL-only per the DUAL API RULE.
 *
 * The summary and the list are @Public(): the guest first-interface lets an
 * unauthenticated visitor open a full worker profile (ACC-01), and a profile
 * whose reviews require an account is not the profile that drives sign-up.
 * Eligibility is not public — it is a statement about the CALLER.
 */
@Resolver()
export class ReviewsResolver {
  constructor(
    private readonly read: ReviewsReadService,
    // Named `eligibilityService` rather than `reviews`: the `reviews` query below
    // owns that name in this class, and GraphQL needs the query to keep it.
    private readonly eligibilityService: ReviewsService,
  ) {}

  @Public()
  @Query(() => ReviewSummaryView, {
    description: 'Average, distribution and count for a profile’s reviews (REV-02).',
  })
  async reviewSummary(
    @Args('subjectId', { type: () => ID }) subjectId: string,
  ): Promise<ReviewSummaryView> {
    return this.read.summary(subjectId);
  }

  @Public()
  @Query(() => [ReviewListItemView], {
    description: 'One identity’s visible reviews, newest first (REV-02).',
  })
  async reviews(
    @Args('subjectId', { type: () => ID }) subjectId: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<ReviewListItemView[]> {
    return this.read.list(subjectId, { limit: limit ?? undefined, offset: offset ?? undefined });
  }

  @Query(() => ReviewEligibilityView, {
    description:
      'Whether the caller may review a job, and about whom (REV-01). Drives the review CTA and the "why not" line behind it.',
  })
  async reviewEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Args('jobId', { type: () => ID }) jobId: string,
  ): Promise<ReviewEligibilityView> {
    const { eligibility } = await this.eligibilityService.eligibility(user.id, jobId);

    return {
      jobId,
      allowed: eligibility.allowed,
      reason: eligibility.reason,
      subjectId: eligibility.subjectId,
    };
  }
}
