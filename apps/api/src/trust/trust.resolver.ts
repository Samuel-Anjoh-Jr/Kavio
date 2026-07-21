import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/decorators/auth.decorators';
import { TierStatusView, TrustBreakdownView, TrustScoreView } from './models/trust.model';
import { TrustService } from './trust.service';

/**
 * Trust reads (TRU-01, TRU-04), GraphQL-only per the DUAL API RULE. Recording a
 * trust event, approving a check or retuning TierConfig are all REST writes.
 *
 * Marked @Public() on purpose: the guest first-interface exists so an
 * unauthenticated visitor can open a full worker profile and judge for
 * themselves, and a Trust Score behind a login would defeat the entire point of
 * a trust-first marketplace. JwtAuthGuard still attaches the identity when a
 * token is present, which is how `trustBreakdown` can widen what it returns for
 * the subject themselves without a second code path.
 */
@Resolver()
export class TrustResolver {
  constructor(private readonly trust: TrustService) {}

  @Public()
  @Query(() => TrustScoreView, {
    description: 'Trust Score (0–100) and derived tier for one identity (TRU-01).',
  })
  async trustScore(
    @Args('subjectId', { type: () => ID }) subjectId: string,
  ): Promise<TrustScoreView> {
    return this.trust.trustScore(subjectId);
  }

  @Public()
  @Query(() => TrustBreakdownView, {
    description:
      'Per-pillar breakdown with the inputs behind each sub-score. `improvements` is populated only for the subject and for staff (TRU-04).',
  })
  async trustBreakdown(
    @Args('subjectId', { type: () => ID }) subjectId: string,
    @CurrentUser() viewer: AuthenticatedUser | undefined,
  ): Promise<TrustBreakdownView> {
    return this.trust.trustBreakdown(subjectId, viewer);
  }

  @Public()
  @Query(() => TierStatusView, {
    description: 'Derived verification tier and what unlocks the next one (TRU-02).',
  })
  async tier(@Args('subjectId', { type: () => ID }) subjectId: string): Promise<TierStatusView> {
    return this.trust.tierStatus(subjectId);
  }
}
