import { HttpStatus, Injectable } from '@nestjs/common';
import { Role, TrustPillar, VerificationTier } from '@kavio/database';
import { AppException } from '../lib/app-exception';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TierService } from './tier.service';
import { TrustScoreService } from './trust-score.service';
import type { TierDerivationResult, UnmetRequirement } from './tier.model';
import {
  UNSCORED_PILLARS,
  type TrustContribution,
  type TrustScoreResult,
} from './trust-score.model';
import type {
  TierRequirementView,
  TierStatusView,
  TrustBreakdownView,
  TrustContributionView,
  TrustScoreView,
  TrustSubScoreView,
} from './models/trust.model';

/** i18n key prefixes. The web catalogue owns the EN/FR copy behind them. */
const IMPROVEMENT_KEY_PREFIX = 'Trust.improve';
const TIER_LABEL_KEY_PREFIX = 'Trust.tier';
const REQUIREMENT_KEY_PREFIX = 'Trust.requirement';

/**
 * The read side of the Trust Engine (TRU-01, TRU-04).
 *
 * Reads recompute from the ledger rather than trusting the stored snapshot. The
 * snapshot exists so search can sort 10,000 workers on an indexed column; a
 * profile view is one identity and can afford to be exactly right, which means a
 * scoring-rule change is visible immediately instead of after a backfill.
 */
@Injectable()
export class TrustService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scores: TrustScoreService,
    private readonly tiers: TierService,
  ) {}

  /** The Trust Score ring shown wherever the entity appears (TRU-01). */
  async trustScore(subjectId: string): Promise<TrustScoreView> {
    await this.assertSubjectExists(subjectId);

    const [result, derived] = await Promise.all([
      this.scores.currentResult(subjectId),
      this.tiers.deriveFor(subjectId),
    ]);

    return {
      subjectId,
      total: result.total,
      tier: derived.tier,
      suspended: result.suspended,
      completedJobs: result.completedJobs,
      computedAt: new Date(),
    };
  }

  /** Tier badge + what unlocks the next rung (TRU-02, TRU-05). */
  async tierStatus(subjectId: string): Promise<TierStatusView> {
    await this.assertSubjectExists(subjectId);
    const derived = await this.tiers.deriveFor(subjectId);
    return this.toTierStatus(subjectId, derived);
  }

  /**
   * The breakdown screen (TRU-04): every sub-score, its inputs, and how to
   * improve it.
   *
   * `improvements` is withheld from third parties. The score and the pillars are
   * public — that transparency is the product — but a ranked list of what this
   * person has not yet verified is theirs, and staff's for review.
   */
  async trustBreakdown(
    subjectId: string,
    viewer: AuthenticatedUser | undefined,
  ): Promise<TrustBreakdownView> {
    await this.assertSubjectExists(subjectId);

    const [result, derived] = await Promise.all([
      this.scores.currentResult(subjectId),
      this.tiers.deriveFor(subjectId),
    ]);

    const subScores = result.subScores.map((sub) => this.toSubScore(sub.pillar, sub));

    return {
      subjectId,
      total: result.total,
      tier: derived.tier,
      suspended: result.suspended,
      subScores,
      tierStatus: this.toTierStatus(subjectId, derived),
      improvements: this.canSeeImprovements(subjectId, viewer) ? rankImprovements(result) : null,
    };
  }

  private canSeeImprovements(subjectId: string, viewer: AuthenticatedUser | undefined): boolean {
    if (!viewer) return false;
    if (viewer.id === subjectId) return true;
    return viewer.activeRole === Role.ADMIN || viewer.activeRole === Role.AGENT;
  }

  private toSubScore(
    pillar: TrustPillar,
    sub: TrustScoreResult['subScores'][number],
  ): TrustSubScoreView {
    return {
      pillar,
      points: sub.points,
      max: sub.max,
      scored: !UNSCORED_PILLARS.includes(pillar),
      contributions: sub.contributions.map(toContributionView),
    };
  }

  private toTierStatus(subjectId: string, derived: TierDerivationResult): TierStatusView {
    return {
      subjectId,
      tier: derived.tier,
      labelKey: `${TIER_LABEL_KEY_PREFIX}.${derived.tier}`,
      // TRU-03: Tier 0 is a "Basic Profile" and must never render as verified.
      verified: derived.tier !== VerificationTier.TIER_0,
      nextTier: derived.nextTier,
      requirements: derived.unmet.map(toRequirementView),
    };
  }

  private async assertSubjectExists(subjectId: string): Promise<void> {
    const subject = await this.prisma.client.user.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });

    if (!subject) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'SUBJECT_NOT_FOUND',
        'We could not find that profile.',
      );
    }
  }
}

function toContributionView(contribution: TrustContribution): TrustContributionView {
  const maxed = contribution.max > 0 && contribution.points >= contribution.max;

  return {
    type: contribution.type,
    occurrences: contribution.occurrences,
    points: contribution.points,
    max: contribution.max,
    maxed,
    // Penalties (max 0) have no "improve me" line — "have fewer disputes" is
    // not advice, it is a scold.
    improvementKey:
      maxed || contribution.max === 0 ? null : `${IMPROVEMENT_KEY_PREFIX}.${contribution.type}`,
  };
}

function toRequirementView(unmet: UnmetRequirement): TierRequirementView {
  return {
    kind: unmet.kind,
    checkType: unmet.checkType ?? null,
    labelKey: unmet.checkType
      ? `${REQUIREMENT_KEY_PREFIX}.CHECK.${unmet.checkType}`
      : `${REQUIREMENT_KEY_PREFIX}.${unmet.kind}`,
    required: String(unmet.required),
    current: String(unmet.current),
  };
}

/**
 * "What should I do next?", ranked by the points still on the table (TRU-04,
 * TRU-05). Penalties and maxed-out rules drop out — the list is only ever things
 * the user can still act on.
 */
export function rankImprovements(result: TrustScoreResult): TrustContributionView[] {
  return result.subScores
    .flatMap((sub) => sub.contributions)
    .filter((contribution) => contribution.max > 0 && contribution.points < contribution.max)
    .map(toContributionView)
    .sort((a, b) => b.max - b.points - (a.max - a.points));
}
