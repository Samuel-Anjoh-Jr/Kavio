import { VerificationCheckType, VerificationTier } from '@kavio/database';

/**
 * Progressive tier derivation (SRS §21.4, TRU-02), as a PURE function.
 *
 * Two rules hold the whole design together:
 *
 *  1. A tier is DERIVED, never assigned. There is no input here for "the tier
 *     someone set" — the only way to move is to satisfy a gate, which is what
 *     stops a badge that says "Verified Professional" from ever being a favour.
 *
 *  2. Every threshold arrives as DATA (TierConfig rows), never as a literal.
 *     "Thresholds are Admin-configurable" is a requirement, so this file knows
 *     the SHAPE of a gate and nothing about its values.
 */

/** Ascending. Derivation walks these in order and stops at the first unmet gate. */
export const TIER_ORDER: readonly VerificationTier[] = [
  VerificationTier.TIER_0,
  VerificationTier.TIER_1,
  VerificationTier.TIER_2,
  VerificationTier.TIER_3,
];

/** One tier's gate, read from the admin-tunable TierConfig table. */
export interface TierGate {
  readonly tier: VerificationTier;
  readonly minScore: number;
  readonly requiredChecks: readonly VerificationCheckType[];
  readonly minCompletedJobs: number | null;
  readonly minAverageRating: number | null;
}

/** Everything a gate can be evaluated against. */
export interface TierDerivationInput {
  readonly trustScore: number;
  /** Checks currently in the VERIFIED state — latest attempt per check type. */
  readonly verifiedChecks: readonly VerificationCheckType[];
  readonly completedJobs: number;
  /** Null until the identity has been rated; a null never satisfies a gate. */
  readonly averageRating: number | null;
  /** Confirmed fraudulent documents force the floor, whatever else is true. */
  readonly suspended: boolean;
}

/** Why a tier was not reached — drives the "what unlocks the next tier" UI. */
export interface UnmetRequirement {
  readonly kind: 'SCORE' | 'CHECK' | 'COMPLETED_JOBS' | 'AVERAGE_RATING';
  /** Present for kind: 'CHECK'. */
  readonly checkType?: VerificationCheckType;
  readonly required: number | string;
  readonly current: number | string;
}

export interface TierDerivationResult {
  readonly tier: VerificationTier;
  /** The tier immediately above, or null at the top. */
  readonly nextTier: VerificationTier | null;
  /** Everything still missing for `nextTier`. Empty at the top tier. */
  readonly unmet: readonly UnmetRequirement[];
}

/** Evaluates one gate, returning every unmet requirement rather than a boolean. */
export function evaluateGate(gate: TierGate, input: TierDerivationInput): UnmetRequirement[] {
  const unmet: UnmetRequirement[] = [];

  if (input.trustScore < gate.minScore) {
    unmet.push({ kind: 'SCORE', required: gate.minScore, current: input.trustScore });
  }

  for (const checkType of gate.requiredChecks) {
    if (!input.verifiedChecks.includes(checkType)) {
      unmet.push({ kind: 'CHECK', checkType, required: 'VERIFIED', current: 'NOT_VERIFIED' });
    }
  }

  if (gate.minCompletedJobs !== null && input.completedJobs < gate.minCompletedJobs) {
    unmet.push({
      kind: 'COMPLETED_JOBS',
      required: gate.minCompletedJobs,
      current: input.completedJobs,
    });
  }

  if (gate.minAverageRating !== null) {
    // An unrated identity has not met a rating gate. Treating a missing rating
    // as anything but "unmet" would hand Tier 3 to someone nobody has reviewed.
    if (input.averageRating === null || input.averageRating < gate.minAverageRating) {
      unmet.push({
        kind: 'AVERAGE_RATING',
        required: gate.minAverageRating,
        current: input.averageRating ?? 0,
      });
    }
  }

  return unmet;
}

/**
 * Derives the tier an identity currently qualifies for.
 *
 * Tiers are PROGRESSIVE: the walk stops at the first unmet gate, so Tier 3's own
 * requirements being satisfied means nothing while Tier 2's ID approval is
 * missing. That is deliberate — the ladder is the guarantee the badge makes.
 *
 * Missing configuration FAILS CLOSED. A tier with no TierConfig row is treated
 * as unreachable rather than as ungated — on an unmigrated or half-seeded
 * database the safe answer is "this identity has not proven anything", never
 * "everyone is Field Verified".
 */
export function deriveTier(
  input: TierDerivationInput,
  gates: readonly TierGate[],
): TierDerivationResult {
  // Fraud collapses the ladder. A suspended identity sits at the floor with
  // nothing to climb toward until the suspension is resolved off-platform.
  if (input.suspended) {
    return { tier: VerificationTier.TIER_0, nextTier: null, unmet: [] };
  }

  const gateFor = new Map(gates.map((gate) => [gate.tier, gate]));

  let achieved: VerificationTier = VerificationTier.TIER_0;
  let nextTier: VerificationTier | null = null;
  let unmet: UnmetRequirement[] = [];

  // TIER_0 is the floor every account already holds, so the walk starts above it.
  for (const tier of TIER_ORDER.slice(1)) {
    const gate = gateFor.get(tier);

    if (!gate) {
      // Unconfigured: the climb stops here with nothing listed to fix, because
      // the fault is a missing gate rather than anything the user has left undone.
      nextTier = tier;
      unmet = [];
      break;
    }

    const failures = evaluateGate(gate, input);

    if (failures.length > 0) {
      nextTier = tier;
      unmet = failures;
      break;
    }

    achieved = tier;
  }

  return { tier: achieved, nextTier, unmet };
}
