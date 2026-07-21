import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  BadgeType,
  EndorsementStatus,
  Prisma,
  VerificationCheckType,
  VerificationStatus,
  VerificationTier,
} from '@trustpro/database';
import { createLogger, getRequestId } from '../../lib/logger';
import { PrismaService } from '../../prisma/prisma.service';
import { TRUST_RECOMPUTED, TrustRecomputedEvent } from '../trust.events';
import { earnedBadges, type BadgeEvaluationInput } from './badge.model';
import { BADGE_UNLOCKED, BadgeUnlockedEvent } from './badge.events';

const logger = createLogger('trust:badges');

/**
 * Milestone badges (P32; TRU-11).
 *
 * Subscribes to trust recomputes rather than being called by them, so the Trust
 * Engine has no idea badges exist — a new consumer of "this identity's numbers
 * changed" is a new listener, never an edit to the scoring code.
 *
 * Every award is idempotent. The unique constraint on (subject, type) is the
 * real guarantee: a replayed event, a double-submitted form and a bulk backfill
 * all converge on one row and one notification.
 */
@Injectable()
export class BadgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(TRUST_RECOMPUTED)
  async onTrustRecomputed(event: TrustRecomputedEvent): Promise<void> {
    await this.evaluate(event.subjectId);
  }

  /**
   * Awards every badge the identity currently earns and has not already got.
   *
   * Reads the state fresh rather than trusting the event payload: the event says
   * "something changed", and what a badge needs is the settled truth after that
   * change — including facts (approved endorsements, an approved ID) that no
   * score event carries.
   */
  async evaluate(subjectId: string): Promise<BadgeType[]> {
    const input = await this.stateFor(subjectId);
    const deserved = earnedBadges(input);

    if (deserved.length === 0) {
      return [];
    }

    const held = await this.prisma.client.userBadge.findMany({
      where: { subjectId, type: { in: deserved } },
      select: { type: true },
    });
    const heldTypes = new Set(held.map((badge) => badge.type));

    const missing = deserved.filter((badge) => !heldTypes.has(badge));
    const awarded: BadgeType[] = [];

    for (const badge of missing) {
      if (await this.award(subjectId, badge, { sourceType: 'TrustRecompute' })) {
        awarded.push(badge);
      }
    }

    return awarded;
  }

  /**
   * Awards one badge, returning whether it was actually new.
   *
   * The unique constraint does the deduplication; catching its violation is
   * cheaper and more correct than a check-then-insert, which two concurrent
   * recomputes would sail straight through.
   */
  async award(
    subjectId: string,
    badge: BadgeType,
    source: {
      sourceType?: string;
      sourceId?: string;
      metadata?: Prisma.InputJsonValue;
    } = {},
  ): Promise<boolean> {
    try {
      await this.prisma.client.userBadge.create({
        data: {
          subjectId,
          type: badge,
          sourceType: source.sourceType ?? null,
          sourceId: source.sourceId ?? null,
          metadata: source.metadata,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Already held. Not an error — this method is meant to be safe to call
        // from anywhere, repeatedly.
        return false;
      }
      throw error;
    }

    logger.info('Badge unlocked', { result: { subjectId, badge } });

    this.events.emit(
      BADGE_UNLOCKED,
      new BadgeUnlockedEvent({ subjectId, badge, requestId: getRequestId() }),
    );

    return true;
  }

  /** Every badge an identity holds, newest first — the profile and timeline read. */
  async listFor(subjectId: string) {
    return this.prisma.client.userBadge.findMany({
      where: { subjectId },
      select: { type: true, awardedAt: true, sourceType: true },
      orderBy: { awardedAt: 'desc' },
    });
  }

  /** Gathers everything the badge rules evaluate against, in one round of queries. */
  private async stateFor(subjectId: string): Promise<BadgeEvaluationInput> {
    const [user, score, checks, endorsements] = await Promise.all([
      this.prisma.client.user.findUnique({
        where: { id: subjectId },
        select: { tier: true, trustScore: true },
      }),
      this.prisma.client.trustScore.findUnique({
        where: { subjectId },
        select: { completedJobs: true, suspended: true },
      }),
      this.prisma.client.verificationRecord.findMany({
        where: {
          subjectId,
          checkType: {
            in: [VerificationCheckType.ID_APPROVED, VerificationCheckType.FIELD_VERIFICATION],
          },
          status: VerificationStatus.VERIFIED,
        },
        select: { checkType: true },
        distinct: ['checkType'],
      }),
      this.prisma.client.endorsement.count({
        where: { subjectId, status: EndorsementStatus.APPROVED, revokedAt: null },
      }),
    ]);

    const verifiedChecks = new Set(checks.map((check) => check.checkType));

    return {
      trustScore: user?.trustScore ?? 0,
      tier: user?.tier ?? VerificationTier.TIER_0,
      completedJobs: score?.completedJobs ?? 0,
      approvedEndorsements: endorsements,
      idApproved: verifiedChecks.has(VerificationCheckType.ID_APPROVED),
      fieldVerified: verifiedChecks.has(VerificationCheckType.FIELD_VERIFICATION),
      suspended: score?.suspended ?? false,
    };
  }
}
