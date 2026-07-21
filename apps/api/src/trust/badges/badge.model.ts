import { BadgeType, VerificationTier } from '@trustpro/database';

/**
 * Milestone badge rules (TRU-11), as a PURE function of trust state.
 *
 * Badges are DERIVED, exactly like tiers, and for the same reason: a badge that
 * can be granted as a favour is not evidence of anything. The one exception is
 * FOUNDING_PROFESSIONAL, which is awarded by the intake tool because the
 * evidence — an agent standing in the workshop — cannot be expressed as a
 * threshold. That one still hangs off a recorded FIELD_VERIFIED event.
 *
 * Badges are also PERMANENT. A Trust Score that later dips does not un-ring the
 * bell: the badge records that the thing happened, not that it is still true.
 * The tier demotes; the badge remembers. Keeping them separate is what lets the
 * tier stay an honest statement of current standing.
 */

export interface BadgeEvaluationInput {
  readonly trustScore: number;
  readonly tier: VerificationTier;
  readonly completedJobs: number;
  /** Approved, unrevoked endorsements (TRU-10). */
  readonly approvedEndorsements: number;
  /** True once a national ID has been approved by staff. */
  readonly idApproved: boolean;
  /** True once an agent has field-verified this identity. */
  readonly fieldVerified: boolean;
  /** Confirmed fraud. Nothing new unlocks while this is true. */
  readonly suspended: boolean;
}

/** Score thresholds and the badge each unlocks. Mirrors TRUST_SCORE_THRESHOLDS. */
const SCORE_BADGES: readonly (readonly [number, BadgeType])[] = [
  [25, BadgeType.TRUST_SCORE_25],
  [50, BadgeType.TRUST_SCORE_50],
  [75, BadgeType.TRUST_SCORE_75],
  [90, BadgeType.TRUST_SCORE_90],
];

/** Completed-job milestones. */
const JOB_BADGES: readonly (readonly [number, BadgeType])[] = [
  [1, BadgeType.FIRST_JOB],
  [10, BadgeType.JOBS_10],
  [25, BadgeType.JOBS_25],
  [50, BadgeType.JOBS_50],
  [100, BadgeType.JOBS_100],
];

/** Approved endorsements needed for the community badge (TRU-10). */
export const COMMUNITY_ENDORSED_THRESHOLD = 5;

/** Tier badges. Reaching a tier is itself the milestone. */
const TIER_BADGES: Readonly<Partial<Record<VerificationTier, BadgeType>>> = {
  [VerificationTier.TIER_2]: BadgeType.VERIFIED_PROFESSIONAL,
  [VerificationTier.TIER_3]: BadgeType.FIELD_VERIFIED_PROFESSIONAL,
};

/** Rank in the tier ladder, so reaching Tier 3 also settles the Tier 2 badge. */
const TIER_RANK: Readonly<Record<VerificationTier, number>> = {
  [VerificationTier.TIER_0]: 0,
  [VerificationTier.TIER_1]: 1,
  [VerificationTier.TIER_2]: 2,
  [VerificationTier.TIER_3]: 3,
};

/**
 * Every badge the input currently earns.
 *
 * Returns the WHOLE set rather than a diff, so it is idempotent and safe to run
 * on every recompute — the caller writes only the ones not already held, and the
 * unique constraint on (subject, type) is the final backstop. A user who jumps
 * from 10 to 60 jobs in one import collects every milestone in between, because
 * they did in fact pass them.
 */
export function earnedBadges(input: BadgeEvaluationInput): BadgeType[] {
  if (input.suspended) {
    // Confirmed fraud overrides the score entirely (TRU-08), and a celebration
    // fired at a suspended account would be the system contradicting itself.
    return [];
  }

  const earned: BadgeType[] = [];

  if (input.idApproved) {
    earned.push(BadgeType.IDENTITY_VERIFIED);
  }

  for (const [threshold, badge] of SCORE_BADGES) {
    if (input.trustScore >= threshold) {
      earned.push(badge);
    }
  }

  for (const [threshold, badge] of JOB_BADGES) {
    if (input.completedJobs >= threshold) {
      earned.push(badge);
    }
  }

  // Tier badges are cumulative down the ladder: someone at Tier 3 has provably
  // been through Tier 2, so awarding only the top one would leave a gap in a
  // timeline that is meant to read as a history.
  for (const [tier, badge] of Object.entries(TIER_BADGES) as [VerificationTier, BadgeType][]) {
    if (TIER_RANK[input.tier] >= TIER_RANK[tier]) {
      earned.push(badge);
    }
  }

  if (input.approvedEndorsements >= COMMUNITY_ENDORSED_THRESHOLD) {
    earned.push(BadgeType.COMMUNITY_ENDORSED);
  }

  return earned;
}

/** i18n key for a badge's EN/FR name and description in the web catalogue. */
export function badgeLabelKey(badge: BadgeType): string {
  return `Badge.${badge}.name`;
}

export function badgeDescriptionKey(badge: BadgeType): string {
  return `Badge.${badge}.description`;
}
