import type { VerificationTier } from '@trustpro/database';

/**
 * Trust domain events (TRU-01, TRU-04).
 *
 * The Trust Engine ANNOUNCES, it never reaches out: it emits these and knows
 * nothing about who listens. Badges, notifications, search re-indexing and the
 * admin dashboard all subscribe independently, so a new consumer of "this worker
 * just reached Tier 2" is a new listener and not an edit to the scoring code.
 */

export const TRUST_TIER_CHANGED = 'trust.tier.changed';
export const TRUST_SCORE_THRESHOLD_CROSSED = 'trust.score.threshold_crossed';
export const TRUST_SUSPENDED = 'trust.suspended';

export type TierDirection = 'PROMOTED' | 'DEMOTED';

/** Fired once per actual tier change — never on a recompute that lands the same. */
export class TierChangedEvent {
  readonly subjectId: string;
  readonly previousTier: VerificationTier;
  readonly tier: VerificationTier;
  readonly direction: TierDirection;
  readonly trustScore: number;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: {
    subjectId: string;
    previousTier: VerificationTier;
    tier: VerificationTier;
    direction: TierDirection;
    trustScore: number;
    occurredAt?: Date;
    requestId?: string;
  }) {
    this.subjectId = init.subjectId;
    this.previousTier = init.previousTier;
    this.tier = init.tier;
    this.direction = init.direction;
    this.trustScore = init.trustScore;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}

/**
 * Fired once per threshold actually crossed. A recompute that moves 48 → 76
 * crosses two (50 and 75) and emits two, so a consumer can react to each
 * milestone without having to diff scores itself.
 */
export class TrustScoreThresholdCrossedEvent {
  readonly subjectId: string;
  readonly previousScore: number;
  readonly score: number;
  readonly threshold: number;
  readonly direction: 'UP' | 'DOWN';
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: {
    subjectId: string;
    previousScore: number;
    score: number;
    threshold: number;
    occurredAt?: Date;
    requestId?: string;
  }) {
    this.subjectId = init.subjectId;
    this.previousScore = init.previousScore;
    this.score = init.score;
    this.threshold = init.threshold;
    this.direction = init.score >= init.previousScore ? 'UP' : 'DOWN';
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}

/** Confirmed fraudulent documents (TRU-08). Permanent, and overrides the score. */
export class TrustSuspendedEvent {
  readonly subjectId: string;
  readonly reason: string;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: { subjectId: string; reason: string; occurredAt?: Date; requestId?: string }) {
    this.subjectId = init.subjectId;
    this.reason = init.reason;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}
