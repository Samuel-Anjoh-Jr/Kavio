import { TrustEventType, TrustPillar } from '@trustpro/database';

/**
 * The Trust Score point model (SRS §21.5), as a PURE function of the event log.
 *
 * Why pure: the score decides who gets work, so it must be reproducible. Given
 * the same TrustEvent rows this returns the same numbers on any machine, at any
 * time, with no database, no clock and no I/O — which is what makes it testable
 * rule by rule and lets the whole score be rebuilt after a rule change with no
 * data migration (drop the snapshot, replay the ledger).
 *
 * Idempotent by construction: rules are evaluated from OCCURRENCE COUNTS per
 * event type, never by folding over the list in order. Replaying the same log
 * twice, or handing it in a different order, cannot move the number.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How an event type converts into points.
 *
 * SRS §21.5 states a value per event but not whether it is per-occurrence or a
 * ceiling. The arithmetic settles it: the positive rows sum to 110 against a
 * 0–100 scale, so each value is the MAXIMUM that signal can contribute, not a
 * payment per occurrence. Repeatable signals therefore accrue toward their cap.
 */
export type TrustRule =
  /** Milestone: the first occurrence grants the full amount, repeats add nothing. */
  | { readonly kind: 'ONCE'; readonly pillar: TrustPillar; readonly points: number }
  /** Repeatable: accrues `pointsPer` per occurrence up to `cap`. */
  | {
      readonly kind: 'ACCRUAL';
      readonly pillar: TrustPillar;
      readonly pointsPer: number;
      readonly cap: number;
    }
  /** Repeatable negative. Uncapped downward; the pillar floor at 0 bounds it. */
  | { readonly kind: 'PENALTY'; readonly pillar: TrustPillar; readonly pointsPer: number }
  /**
   * Accrues like ACCRUAL but fades out as verified job history accumulates
   * (§21.6, FR-35): endorsements make early credibility possible without
   * diluting reputation that has actually been earned on the platform.
   */
  | {
      readonly kind: 'TAPERED_ACCRUAL';
      readonly pillar: TrustPillar;
      readonly pointsPer: number;
      readonly cap: number;
      /** Completed jobs at which the contribution has tapered to zero. */
      readonly taperedOutAt: number;
    }
  /**
   * Cancels occurrences of another event type, one for one.
   *
   * The ledger is append-only, so influence is withdrawn by appending its
   * negation. Modelled as a first-class rule rather than special-cased inside
   * the endorsement arithmetic, because "this event undoes that one" is a shape
   * disputes and reversed reviews will need too.
   */
  | { readonly kind: 'REVOCATION'; readonly revokes: TrustEventType }
  /** Overrides the numeric score entirely (TRU-08). */
  | { readonly kind: 'SUSPENSION' }
  /**
   * An admin moving a score by hand in an exceptional case (ADM-04, FR-42).
   *
   * The ONE rule whose magnitude is not fixed here: the amount rides on the
   * ledger row's own `delta`, so replaying the log still reproduces the score
   * exactly and an adjustment stays a fact the score is derived FROM rather than
   * an edit applied TO it. `maxMagnitude` bounds a single event, which is what
   * keeps "exceptional" from becoming "however much the tool allows".
   *
   * Applied to the TOTAL, not to a pillar — see APPLYING AN ADJUSTMENT below.
   */
  | { readonly kind: 'MANUAL_ADJUSTMENT'; readonly maxMagnitude: number };

// ─────────────────────────────────────────────────────────────────────────────
// Endorsement weighting (TRU-10, §21.6, FR-35)
//
// Named constants rather than literals inside the rule, because these three
// numbers ARE the requirement — "a modest, capped amount that tapers as verified
// job history accumulates" — and a reviewer should be able to read them without
// reading the arithmetic that applies them.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Points per approved endorsement. Deliberately small: one point against a
 * 0–100 scale, so a wall of endorsements never reads like a verified ID.
 */
export const ENDORSEMENT_POINTS_EACH = 1;

/**
 * The most endorsements can EVER contribute, before the taper.
 *
 * Five points, against 20 for an approved ID and 15 for completed jobs. That
 * ratio is the whole design: community credibility opens the door for a worker
 * nobody has hired yet, and it cannot be stacked into a substitute for either
 * identity verification or actual work.
 */
export const ENDORSEMENT_CAP = 5;

/**
 * Completed jobs at which endorsements contribute nothing at all.
 *
 * Ten was chosen because it is half the Tier 3 job gate (§21.4): by the time a
 * worker is halfway to the top tier, their own delivery history is a far better
 * signal than anyone's word, and continuing to pay for vouching would dilute
 * exactly the reputation the platform exists to make legible.
 */
export const ENDORSEMENT_TAPERED_OUT_AT = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Admin adjustment (ADM-04, FR-42)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The most a SINGLE admin adjustment may move a score, in either direction.
 *
 * A quarter of the whole scale. Large enough for the cases ADM-04 names — a
 * fraud penalty, a Field-Verified bonus for a Founding Professional — and small
 * enough that no one action rewrites an identity's standing. An admin who needs
 * more applies a second one, and each is separately reasoned and separately
 * audited, which is the point: the ceiling is not there to stop an admin, it is
 * there to make a large intervention look like what it is.
 *
 * Ending an account is NOT this mechanism. Confirmed fraud is
 * FAKE_DOCUMENTS_CONFIRMED, which suspends outright and overrides the number —
 * so nobody ever needs to reach for "-100" here.
 */
export const ADMIN_ADJUSTMENT_MAX_MAGNITUDE = 25;

/**
 * The multiplier applied to the endorsement contribution at a given job count.
 *
 * Straight-line from 1 (no history, full weight) to 0 (at `taperedOutAt`).
 * Exported so the API can SHOW a worker their current taper instead of leaving
 * them to wonder why a number went down when nothing bad happened.
 */
export function endorsementTaper(
  completedJobs: number,
  taperedOutAt: number = ENDORSEMENT_TAPERED_OUT_AT,
): number {
  return clamp(1 - completedJobs / taperedOutAt, 0, 1);
}

/**
 * The point model, one entry per event type. The `points`/`cap` values are the
 * SRS §21.5 table verbatim — they are the reviewed contract and must not be
 * tuned here casually.
 *
 * The `pointsPer` rates are NOT in the SRS (it gives only the ceilings), so each
 * one is chosen to reach its cap at a threshold the product already commits to
 * elsewhere, keeping the curve explainable to a worker:
 *   - completed jobs reach full marks at 20 jobs, the Tier 3 gate (§21.4)
 *   - repeat customers at 5, excellent reviews at 10
 */
export const TRUST_POINT_MODEL: Readonly<Record<TrustEventType, TrustRule>> = {
  // Identity — "are you who you claim to be?" (§21.6)
  [TrustEventType.ACCOUNT_CREATED]: {
    kind: 'ONCE',
    pillar: TrustPillar.IDENTITY,
    points: 15,
  },
  [TrustEventType.PHONE_VERIFIED]: {
    kind: 'ONCE',
    pillar: TrustPillar.IDENTITY,
    points: 10,
  },
  [TrustEventType.ID_VERIFIED]: {
    kind: 'ONCE',
    pillar: TrustPillar.IDENTITY,
    points: 20,
  },

  // Professional — "can you actually do the work?" (§21.6)
  [TrustEventType.FIELD_VERIFIED]: {
    kind: 'ONCE',
    pillar: TrustPillar.PROFESSIONAL,
    points: 15,
  },
  [TrustEventType.PORTFOLIO_ADDED]: {
    kind: 'ONCE',
    pillar: TrustPillar.PROFESSIONAL,
    points: 10,
  },
  [TrustEventType.ENDORSEMENT_RECEIVED]: {
    kind: 'TAPERED_ACCRUAL',
    pillar: TrustPillar.PROFESSIONAL,
    pointsPer: ENDORSEMENT_POINTS_EACH,
    cap: ENDORSEMENT_CAP,
    taperedOutAt: ENDORSEMENT_TAPERED_OUT_AT,
  },
  [TrustEventType.ENDORSEMENT_REVOKED]: {
    kind: 'REVOCATION',
    revokes: TrustEventType.ENDORSEMENT_RECEIVED,
  },

  // Marketplace — "do clients have good experiences with you?" (§21.6)
  [TrustEventType.JOB_COMPLETED]: {
    kind: 'ACCRUAL',
    pillar: TrustPillar.MARKETPLACE,
    pointsPer: 0.75,
    cap: 15,
  },
  [TrustEventType.REPEAT_CUSTOMER]: {
    kind: 'ACCRUAL',
    pillar: TrustPillar.MARKETPLACE,
    pointsPer: 2,
    cap: 10,
  },
  [TrustEventType.EXCELLENT_REVIEW]: {
    kind: 'ACCRUAL',
    pillar: TrustPillar.MARKETPLACE,
    pointsPer: 1.5,
    cap: 15,
  },
  [TrustEventType.EXCELLENT_REVIEW_REVOKED]: {
    kind: 'REVOCATION',
    revokes: TrustEventType.EXCELLENT_REVIEW,
  },
  [TrustEventType.DISPUTE_UPHELD]: {
    kind: 'PENALTY',
    pillar: TrustPillar.MARKETPLACE,
    pointsPer: -20,
  },
  /**
   * A client raised a dispute and lost it (ADM-05). Half the weight of
   * DISPUTE_UPHELD, deliberately: a worker who took payment and did not deliver
   * broke the bargain the escrow exists to secure, while a client whose
   * complaint did not hold up froze someone's payout. Both are real; only one is
   * a breach of the work. Pricing them the same would either under-punish
   * non-delivery or teach clients that complaining is as dangerous as failing to
   * do the job.
   */
  [TrustEventType.DISPUTE_LOST]: {
    kind: 'PENALTY',
    pillar: TrustPillar.MARKETPLACE,
    pointsPer: -10,
  },
  [TrustEventType.JOB_CANCELLED]: {
    kind: 'PENALTY',
    pillar: TrustPillar.MARKETPLACE,
    pointsPer: -10,
  },

  // Overrides everything.
  [TrustEventType.FAKE_DOCUMENTS_CONFIRMED]: { kind: 'SUSPENSION' },

  // Outside the model by design (ADM-04). See the MANUAL_ADJUSTMENT rule kind.
  [TrustEventType.ADMIN_ADJUSTMENT]: {
    kind: 'MANUAL_ADJUSTMENT',
    maxMagnitude: ADMIN_ADJUSTMENT_MAX_MAGNITUDE,
  },
};

/**
 * Financial Trust (§21.6: escrow, payment reliability, chargeback history) has
 * NO rules in §21.5 — the escrow state machine that would emit them arrives in
 * Phase 4. The pillar is modelled now so the breakdown screen and the API shape
 * are already correct, and it reports a maximum of 0 rather than a made-up
 * number. Phase 4 adds its event types to the model above and the pillar starts
 * scoring with no change to any consumer.
 */
export const UNSCORED_PILLARS: readonly TrustPillar[] = [TrustPillar.FINANCIAL];

/** The highest total the model can produce before clamping (115 → clamped 100). */
export const MAX_TOTAL_SCORE = 100;
export const MIN_TOTAL_SCORE = 0;

/** Score thresholds that emit a crossing event (badges, notifications). */
export const TRUST_SCORE_THRESHOLDS: readonly number[] = [25, 50, 75, 90];

// ─────────────────────────────────────────────────────────────────────────────
// Inputs and results
// ─────────────────────────────────────────────────────────────────────────────

/** The only shape the model needs from a TrustEvent row. */
export interface TrustEventInput {
  readonly type: TrustEventType;
  /**
   * The row's recorded delta. Read for MANUAL_ADJUSTMENT events ONLY, whose
   * amount is not derivable from the type — every other rule ignores it, and the
   * column stays what it always was for them: an audit note, not an input.
   */
  readonly delta?: number | null;
}

/** One rule's contribution, which is what the TRU-04 breakdown itemises. */
export interface TrustContribution {
  readonly type: TrustEventType;
  readonly pillar: TrustPillar;
  readonly occurrences: number;
  /** Points actually counted, after cap and taper. */
  readonly points: number;
  /** The most this rule can ever contribute (0 for penalties). */
  readonly max: number;
}

export interface TrustSubScore {
  readonly pillar: TrustPillar;
  /** Clamped to [0, max]. */
  readonly points: number;
  /** Sum of this pillar's positive caps. 0 for a pillar with no rules yet. */
  readonly max: number;
  readonly contributions: readonly TrustContribution[];
}

export interface TrustScoreResult {
  /** Clamped to [0, 100]. Always 0 when suspended. */
  readonly total: number;
  readonly subScores: readonly TrustSubScore[];
  /**
   * Confirmed fraudulent documents (TRU-08). When true the numeric score is
   * meaningless and must never be shown as if it were earned.
   */
  readonly suspended: boolean;
  /** Denormalised tier-gate input (§21.4), counted from the same log. */
  readonly completedJobs: number;
  /**
   * Net of the admin adjustments already folded into `total` (ADM-04).
   *
   * Surfaced as its own number so the breakdown can say so out loud. A score that
   * was moved by hand and shows only four earned pillars is a screen that lies by
   * omission — and the four pillars would no longer add up to the total, which is
   * exactly the sort of quiet arithmetic mismatch that costs trust in a trust
   * product. Zero for the overwhelming majority of identities.
   */
  readonly adjustment: number;
  readonly eventCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Computation
// ─────────────────────────────────────────────────────────────────────────────

const PILLAR_ORDER: readonly TrustPillar[] = [
  TrustPillar.IDENTITY,
  TrustPillar.PROFESSIONAL,
  TrustPillar.MARKETPLACE,
  TrustPillar.FINANCIAL,
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Half-away-from-zero, so a −2.5 penalty rounds to −3 rather than JS's −2. */
function round(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** The ceiling a single rule can contribute; penalties can only subtract. */
export function ruleMax(rule: TrustRule): number {
  switch (rule.kind) {
    case 'ONCE':
      return rule.points;
    case 'ACCRUAL':
    case 'TAPERED_ACCRUAL':
      return rule.cap;
    case 'PENALTY':
    case 'REVOCATION':
    case 'SUSPENSION':
    case 'MANUAL_ADJUSTMENT':
      // An adjustment is not a ceiling anyone can earn toward, so it contributes
      // nothing to any pillar's maximum — it moves the total after the fact.
      return 0;
  }
}

/**
 * Occurrences of `type` that still stand, after subtracting anything that
 * revokes it. Never negative: more revocations than grants means zero, not a
 * debt — withdrawing an endorsement should return a worker to where they were,
 * not punish them for having been endorsed.
 */
export function effectiveOccurrences(
  type: TrustEventType,
  occurrences: ReadonlyMap<TrustEventType, number>,
): number {
  const granted = occurrences.get(type) ?? 0;

  const revoked = (Object.entries(TRUST_POINT_MODEL) as [TrustEventType, TrustRule][])
    .filter(([, rule]) => rule.kind === 'REVOCATION' && rule.revokes === type)
    .reduce((sum, [revokerType]) => sum + (occurrences.get(revokerType) ?? 0), 0);

  return Math.max(granted - revoked, 0);
}

/** The ceiling a pillar can reach: the sum of its rules' ceilings. */
export function pillarMax(pillar: TrustPillar): number {
  return Object.values(TRUST_POINT_MODEL)
    .filter((rule) => scoringPillarOf(rule) === pillar)
    .reduce((sum, rule) => sum + ruleMax(rule), 0);
}

/**
 * The pillar a rule scores into, or null for rules that score into none.
 *
 * Suspension is a verdict and revocation is a negation of something else; both
 * are pillar-less by nature, and giving either an arbitrary pillar would put a
 * meaningless row in the TRU-04 breakdown.
 */
export function scoringPillarOf(rule: TrustRule): TrustPillar | null {
  return rule.kind === 'SUSPENSION' ||
    rule.kind === 'REVOCATION' ||
    rule.kind === 'MANUAL_ADJUSTMENT'
    ? null
    : rule.pillar;
}

/**
 * The net of every admin adjustment on the log, each clamped to its per-event
 * bound (ADM-04).
 *
 * Clamped HERE rather than only at the write path, so a row that reached the
 * database with an out-of-range delta — a bad migration, a direct SQL edit —
 * still cannot move a score further than the reviewed maximum. The service
 * rejects such a request; this makes the rejection true retroactively as well.
 */
export function adjustmentTotal(events: readonly TrustEventInput[]): number {
  const rule = TRUST_POINT_MODEL[TrustEventType.ADMIN_ADJUSTMENT];
  const bound = rule.kind === 'MANUAL_ADJUSTMENT' ? rule.maxMagnitude : 0;

  return events
    .filter((event) => event.type === TrustEventType.ADMIN_ADJUSTMENT)
    .reduce((sum, event) => sum + clamp(event.delta ?? 0, -bound, bound), 0);
}

/**
 * Recomputes the Trust Score from an identity's full event log (TRU-01).
 *
 * Deterministic and idempotent — the result depends only on how many times each
 * event type appears, so callers may pass the log in any order and may replay it
 * as often as they like.
 */
export function computeTrustScore(events: readonly TrustEventInput[]): TrustScoreResult {
  const occurrences = new Map<TrustEventType, number>();
  for (const event of events) {
    occurrences.set(event.type, (occurrences.get(event.type) ?? 0) + 1);
  }

  const completedJobs = occurrences.get(TrustEventType.JOB_COMPLETED) ?? 0;

  // Fraud is not a score adjustment, it is a verdict: a confirmed fake document
  // ends the account regardless of how much trust was banked before it (TRU-08).
  // Checked before any arithmetic so no accumulated total can survive it.
  const suspended = (occurrences.get(TrustEventType.FAKE_DOCUMENTS_CONFIRMED) ?? 0) > 0;

  const contributionsByPillar = new Map<TrustPillar, TrustContribution[]>(
    PILLAR_ORDER.map((pillar) => [pillar, []]),
  );

  for (const [type, rule] of Object.entries(TRUST_POINT_MODEL) as [TrustEventType, TrustRule][]) {
    // Suspension is a verdict, and a revocation scores nothing of its own — it
    // only reduces the count of what it cancels, which `effectiveOccurrences`
    // has already applied to that rule. An adjustment belongs to no pillar and
    // is applied to the total below.
    if (
      rule.kind === 'SUSPENSION' ||
      rule.kind === 'REVOCATION' ||
      rule.kind === 'MANUAL_ADJUSTMENT'
    ) {
      continue;
    }

    const count = effectiveOccurrences(type, occurrences);
    let points = 0;

    switch (rule.kind) {
      case 'ONCE':
        points = count > 0 ? rule.points : 0;
        break;
      case 'ACCRUAL':
        points = Math.min(count * rule.pointsPer, rule.cap);
        break;
      case 'PENALTY':
        points = count * rule.pointsPer;
        break;
      case 'TAPERED_ACCRUAL': {
        // Full weight while there is no platform history, straight-line to zero
        // by `taperedOutAt` completed jobs — earned reputation displaces vouching.
        points =
          Math.min(count * rule.pointsPer, rule.cap) *
          endorsementTaper(completedJobs, rule.taperedOutAt);
        break;
      }
    }

    contributionsByPillar.get(rule.pillar)?.push({
      type,
      pillar: rule.pillar,
      occurrences: count,
      // Rounded per rule rather than only at the pillar total, so the breakdown
      // screen's itemised rows visibly add up to the sub-score it shows.
      points: suspended ? 0 : round(points),
      max: ruleMax(rule),
    });
  }

  const subScores: TrustSubScore[] = PILLAR_ORDER.map((pillar) => {
    const contributions = contributionsByPillar.get(pillar) ?? [];
    const max = pillarMax(pillar);
    const raw = contributions.reduce((sum, contribution) => sum + contribution.points, 0);

    return {
      pillar,
      // A pillar floors at 0: penalties sink the pillar they belong to, they do
      // not bleed into pillars the user did earn.
      points: suspended ? 0 : clamp(raw, 0, max),
      max,
      contributions,
    };
  });

  // APPLYING AN ADJUSTMENT (ADM-04).
  //
  // At the TOTAL, deliberately, not inside a pillar. Two reasons, both of which
  // bite if it is done the other way:
  //
  //   - A pillar clamps to [0, its max]. A −20 fraud penalty filed under
  //     Marketplace when that pillar holds 5 points would silently become −5, and
  //     a +10 bonus filed under a pillar already at its ceiling would become
  //     nothing at all. An admin's stated intervention must not be quietly
  //     swallowed by a cap it never knew about.
  //   - ADM-04 says "adjust Trust Scores" — the composite. The four pillars each
  //     claim to measure a specific thing, and an exceptional manual correction
  //     is not evidence about identity, professionalism, marketplace behaviour or
  //     finances. Filing it under one of them would make that pillar overstate
  //     what it knows.
  //
  // It lands before the [0, 100] clamp, so an adjustment can never push a score
  // outside the scale, and `suspended` still overrides everything.
  const adjustment = suspended ? 0 : adjustmentTotal(events);

  const total = suspended
    ? MIN_TOTAL_SCORE
    : clamp(
        subScores.reduce((sum, sub) => sum + sub.points, 0) + adjustment,
        MIN_TOTAL_SCORE,
        MAX_TOTAL_SCORE,
      );

  return {
    total,
    subScores,
    suspended,
    completedJobs,
    adjustment,
    eventCount: events.length,
  };
}

/** Convenience lookup used by the persistence layer and the resolver. */
export function subScoreFor(result: TrustScoreResult, pillar: TrustPillar): TrustSubScore {
  const found = result.subScores.find((sub) => sub.pillar === pillar);
  // Every pillar in PILLAR_ORDER is always produced; this keeps the type honest.
  return found ?? { pillar, points: 0, max: pillarMax(pillar), contributions: [] };
}

/**
 * Thresholds strictly crossed moving from `previous` to `next`. Used to fire
 * one event per milestone actually passed (upward or downward), never a repeat.
 */
export function crossedThresholds(previous: number, next: number): number[] {
  const low = Math.min(previous, next);
  const high = Math.max(previous, next);
  return TRUST_SCORE_THRESHOLDS.filter((threshold) => threshold > low && threshold <= high);
}
