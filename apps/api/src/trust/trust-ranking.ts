import { Prisma, VerificationTier } from '@trustpro/database';

/**
 * Trust in default search ranking (TRU-04, DIS-08).
 *
 * Phase 3 discovery owns the query; this module owns the trust half of its ORDER
 * BY, so "how much does trust count" is one reviewed decision in one file rather
 * than a magic number copied into every search path.
 *
 * The ordering is deliberately tier-first, score-second. A tier is a completed
 * verification gate — an approved ID, a field visit — while the score also moves
 * on softer marketplace signals. Sorting on the score alone would let a busy
 * unverified worker outrank a field-verified one, which is exactly the confusion
 * the tier badge exists to prevent (§21.4: higher tiers get priority placement).
 */

/** Ranking weight per tier. Gaps are wide enough that a tier always wins. */
export const TIER_RANK_WEIGHT: Readonly<Record<VerificationTier, number>> = {
  [VerificationTier.TIER_0]: 0,
  [VerificationTier.TIER_1]: 1,
  [VerificationTier.TIER_2]: 2,
  [VerificationTier.TIER_3]: 3,
};

/**
 * The trust portion of a Prisma `orderBy` for worker/profile searches. Spread it
 * AFTER any relevance or distance ordering — trust breaks ties, it does not
 * override "is this even the trade I searched for".
 *
 * Both columns are indexed (`User.tier` via the ranking index, `TrustScore.total`
 * via its own), so this stays an index scan rather than a sort of the world.
 */
export const TRUST_RANKING_ORDER_BY: readonly Prisma.UserOrderByWithRelationInput[] = [
  { tier: 'desc' },
  { trustScore: 'desc' },
];

/**
 * The same ordering for the raw-SQL/PostGIS paths, where spatial math means the
 * query cannot go through Prisma's builder. Kept beside the Prisma version so
 * the two can never quietly disagree about what "best first" means.
 */
export const TRUST_RANKING_SQL = Prisma.sql`"tier" DESC, "trustScore" DESC`;

/**
 * A single comparable number, for ranking a list already in memory (a cached
 * result page, a shortlist). Suspended identities sort to the bottom rather than
 * being filtered here — whether to hide them is the caller's policy call.
 */
export function trustRankValue(input: {
  tier: VerificationTier;
  trustScore: number;
  suspended?: boolean;
}): number {
  if (input.suspended) {
    return -1;
  }
  return TIER_RANK_WEIGHT[input.tier] * 1000 + input.trustScore;
}
