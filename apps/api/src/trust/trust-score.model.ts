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
  /** Overrides the numeric score entirely (TRU-08). */
  | { readonly kind: 'SUSPENSION' };

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
    pointsPer: 1,
    cap: 5,
    taperedOutAt: 10,
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
  [TrustEventType.DISPUTE_UPHELD]: {
    kind: 'PENALTY',
    pillar: TrustPillar.MARKETPLACE,
    pointsPer: -20,
  },
  [TrustEventType.JOB_CANCELLED]: {
    kind: 'PENALTY',
    pillar: TrustPillar.MARKETPLACE,
    pointsPer: -10,
  },

  // Overrides everything.
  [TrustEventType.FAKE_DOCUMENTS_CONFIRMED]: { kind: 'SUSPENSION' },
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
    case 'SUSPENSION':
      return 0;
  }
}

/** The ceiling a pillar can reach: the sum of its rules' ceilings. */
export function pillarMax(pillar: TrustPillar): number {
  return Object.values(TRUST_POINT_MODEL)
    .filter((rule) => rule.kind !== 'SUSPENSION' && rule.pillar === pillar)
    .reduce((sum, rule) => sum + ruleMax(rule), 0);
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
    if (rule.kind === 'SUSPENSION') {
      continue;
    }

    const count = occurrences.get(type) ?? 0;
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
        const taper = clamp(1 - completedJobs / rule.taperedOutAt, 0, 1);
        points = Math.min(count * rule.pointsPer, rule.cap) * taper;
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

  const total = suspended
    ? MIN_TOTAL_SCORE
    : clamp(
        subScores.reduce((sum, sub) => sum + sub.points, 0),
        MIN_TOTAL_SCORE,
        MAX_TOTAL_SCORE,
      );

  return {
    total,
    subScores,
    suspended,
    completedJobs,
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
