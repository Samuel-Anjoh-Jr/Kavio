import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser, Public } from '../../auth/decorators/auth.decorators';
import { BadgeService } from '../badges/badge.service';
import { badgeDescriptionKey, badgeLabelKey } from '../badges/badge.model';
import { TrustHistoryService } from '../trust-history.service';
import {
  BadgeView,
  EndorsementInfluenceView,
  EndorsementView,
  TrustHistoryEntryView,
} from '../models/endorsement.model';
import { EndorsementService } from './endorsement.service';

/**
 * Endorsement, badge and trust-history reads (TRU-10, TRU-11), GraphQL-only per
 * the DUAL API RULE.
 *
 * Endorsements and badges are @Public() for the same reason the Trust Score is:
 * the guest first-interface exists so an unauthenticated visitor can judge a
 * worker for themselves, and evidence they cannot see does not help them.
 * `trustHistory` is deliberately NOT public — see the service.
 */
@Resolver()
export class EndorsementResolver {
  constructor(
    // Named for the service, not the query: `endorsements` and `badges` are
    // query names on this class, and a property sharing one shadows it.
    private readonly endorsementService: EndorsementService,
    private readonly badgeService: BadgeService,
    private readonly history: TrustHistoryService,
  ) {}

  @Public()
  @Query(() => [EndorsementView], {
    description: 'Approved community endorsements on a profile, newest first (TRU-10).',
  })
  async endorsements(
    @Args('subjectId', { type: () => ID }) subjectId: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<EndorsementView[]> {
    const rows = await this.endorsementService.listFor(subjectId, limit ?? undefined);

    return rows.map((row) => ({
      id: row.id,
      relationship: row.relationship,
      relationshipKey: `Endorsement.relationship.${row.relationship}`,
      quote: row.quote,
      rating: row.rating,
      authorName: row.author?.name ?? row.authorName,
      authorId: row.author?.id ?? null,
      onPlatform: row.author !== null,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Public on purpose: a worker whose endorsement points shrink as they complete
   * jobs deserves to see that this is the design working. So does a client
   * wondering why a heavily-endorsed newcomer does not outrank a proven one.
   */
  @Public()
  @Query(() => EndorsementInfluenceView, {
    description:
      'What endorsements contribute today and how the taper is shaping it (TRU-10). The cap and taper are the requirement, made visible.',
  })
  async endorsementInfluence(
    @Args('subjectId', { type: () => ID }) subjectId: string,
  ): Promise<EndorsementInfluenceView> {
    return this.endorsementService.influenceFor(subjectId);
  }

  @Public()
  @Query(() => [BadgeView], {
    description: 'Milestone badges an identity has unlocked, newest first (TRU-11).',
  })
  async badges(@Args('subjectId', { type: () => ID }) subjectId: string): Promise<BadgeView[]> {
    const rows = await this.badgeService.listFor(subjectId);

    return rows.map((row) => ({
      type: row.type,
      labelKey: badgeLabelKey(row.type),
      descriptionKey: badgeDescriptionKey(row.type),
      awardedAt: row.awardedAt,
    }));
  }

  /**
   * NOT public. The score, the tier and the pillars are the transparency the
   * product promises; a dated log of every dispute and rejection is the
   * subject's own history, and staff's for review.
   */
  @Query(() => [TrustHistoryEntryView], {
    description:
      'The owner’s trust history timeline: scored events, badge unlocks and tier changes, merged newest first (TRU-11).',
  })
  async trustHistory(
    @Args('subjectId', { type: () => ID }) subjectId: string,
    @CurrentUser() viewer: AuthenticatedUser | undefined,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<TrustHistoryEntryView[]> {
    const entries = await this.history.timeline(subjectId, viewer, limit ?? undefined);

    return entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      occurredAt: entry.occurredAt,
      labelKey: entry.labelKey,
      badge: entry.badge,
      delta: entry.delta,
      tier: entry.tier,
    }));
  }
}
