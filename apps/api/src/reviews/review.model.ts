import { BookingStatus, ReviewStatus } from '@trustpro/database';

/**
 * The review rules (REV-01, REV-02) as PURE functions.
 *
 * Two things live here, and both are here rather than inside the service for the
 * same reason the escrow machine and the document-access rule are: they are the
 * requirement itself, they decide who may affect someone else's Trust Score, and
 * a rule spread across call sites gets re-interpreted slightly differently at
 * each one until a version of it is wrong.
 *
 *   1. ELIGIBILITY — "reviews shall be tied to real completed jobs to prevent
 *      fabrication" (REV-02). Returns a REASON, never a boolean, so the API can
 *      tell a client WHY the review button is absent instead of silently hiding
 *      it, and so every refusal is testable by name.
 *
 *   2. THE SUMMARY — average, distribution and count (REV-02). Arithmetic over
 *      whole-star counts, with the rounding decided in one place.
 */

/** The bounds the DTO validates and the migration CHECK-constrains. */
export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;

/** Every star value, ascending — the distribution's row order. */
export const REVIEW_RATING_VALUES: readonly number[] = [1, 2, 3, 4, 5];

/**
 * The rating at or above which a review is "excellent" and pays the SRS §21.5
 * EXCELLENT_REVIEW points.
 *
 * Four, not five. The point model accrues 1.5 per excellent review to a cap of
 * 15, so ten of them max the contribution — a threshold of five would make that
 * ceiling reachable only by a worker with a perfect record, which turns a
 * marketplace-behaviour signal into a perfection bonus. Four stars is a client
 * saying the job was done well, and that is what the Marketplace pillar is
 * measuring. Three is "acceptable" and pays nothing rather than costing anything:
 * the point model has no rule for a mediocre review, deliberately.
 */
export const EXCELLENT_REVIEW_MIN_RATING = 4;

export function isExcellentReview(rating: number): boolean {
  return rating >= EXCELLENT_REVIEW_MIN_RATING;
}

/**
 * Booking states in which the work is finished and a review is honest.
 *
 * COMPLETED (the worker marked it done, the client has not confirmed yet) and
 * RELEASED (confirmed and paid out). Not REFUNDED — the work was undone, and a
 * star rating of an engagement that was reversed measures nothing. Not DISPUTED:
 * a case under adjudication gets resolved first, and if it resolves to RELEASED
 * the review becomes available then. Reviewing mid-dispute would turn the ratings
 * system into a second, unadjudicated venue for the same argument.
 */
export const REVIEWABLE_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.RELEASED,
];

export type ReviewEligibilityReason =
  | 'ELIGIBLE'
  /** No booking at all — nothing was ever agreed, so nothing was delivered. */
  | 'NO_BOOKING'
  /** The caller is neither the client nor the worker on this engagement. */
  | 'NOT_A_PARTICIPANT'
  /** Agreed, but the work has not reached a finished state yet. */
  | 'NOT_COMPLETED'
  /** One review per person per job (REV-02). */
  | 'ALREADY_REVIEWED';

export interface ReviewEligibilityDecision {
  readonly allowed: boolean;
  readonly reason: ReviewEligibilityReason;
  /** Who the review would be about. Null whenever the review is not allowed. */
  readonly subjectId: string | null;
}

/** The booking facts the decision needs. Deliberately not the Prisma row. */
export interface ReviewEligibilityBooking {
  readonly clientId: string;
  readonly workerId: string;
  readonly status: BookingStatus;
}

/**
 * Whether `authorId` may review the other party to `booking` (REV-01, REV-02).
 *
 * The subject is DERIVED from the booking rather than accepted from the caller:
 * a request that names its own subject is a request that can name anyone, and
 * "reviews are tied to real completed jobs" would then rest on the client being
 * honest about who it was reviewing.
 */
export function decideReviewEligibility(
  booking: ReviewEligibilityBooking | null,
  authorId: string,
  alreadyReviewed: boolean,
): ReviewEligibilityDecision {
  if (!booking) {
    return { allowed: false, reason: 'NO_BOOKING', subjectId: null };
  }

  const isClient = booking.clientId === authorId;
  const isWorker = booking.workerId === authorId;
  if (!isClient && !isWorker) {
    return { allowed: false, reason: 'NOT_A_PARTICIPANT', subjectId: null };
  }

  if (!REVIEWABLE_BOOKING_STATUSES.includes(booking.status)) {
    return { allowed: false, reason: 'NOT_COMPLETED', subjectId: null };
  }

  if (alreadyReviewed) {
    return { allowed: false, reason: 'ALREADY_REVIEWED', subjectId: null };
  }

  // The counterparty, never the caller's claim about who they are rating.
  return {
    allowed: true,
    reason: 'ELIGIBLE',
    subjectId: isClient ? booking.workerId : booking.clientId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary arithmetic (REV-02)
// ─────────────────────────────────────────────────────────────────────────────

/** One bar of the distribution chart. */
export interface RatingDistributionBucket {
  readonly rating: number;
  readonly count: number;
  /** Share of the total, 0–1. Zero when there are no reviews at all. */
  readonly share: number;
}

export interface ReviewSummary {
  readonly total: number;
  /**
   * Mean of published ratings, rounded to two decimals — the precision the
   * Tier 3 gate is expressed in (§21.4 "≥ 4.8"). Null when there are no reviews:
   * "unrated" and "rated zero" are different facts, and collapsing them would
   * satisfy a rating gate with an absence of evidence.
   */
  readonly average: number | null;
  readonly distribution: readonly RatingDistributionBucket[];
}

/**
 * Builds the profile summary from whole-star counts (REV-02).
 *
 * Takes counts rather than rows so the caller can feed it a single grouped query
 * instead of loading every review a popular worker ever received.
 */
export function summariseRatings(countsByRating: ReadonlyMap<number, number>): ReviewSummary {
  const total = REVIEW_RATING_VALUES.reduce(
    (sum, rating) => sum + (countsByRating.get(rating) ?? 0),
    0,
  );

  const weighted = REVIEW_RATING_VALUES.reduce(
    (sum, rating) => sum + rating * (countsByRating.get(rating) ?? 0),
    0,
  );

  return {
    total,
    average: total === 0 ? null : roundToTwo(weighted / total),
    // Every star is present even at zero: a distribution chart that drops its
    // empty bars misreports the shape of the ratings it is drawing.
    distribution: REVIEW_RATING_VALUES.map((rating) => {
      const count = countsByRating.get(rating) ?? 0;
      return { rating, count, share: total === 0 ? 0 : count / total };
    }),
  };
}

/** Two decimals, half-up. The precision §21.4 states the rating gate in. */
export function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Only published reviews count toward the average and the Trust Engine. */
export function countsToward(status: ReviewStatus): boolean {
  return status === ReviewStatus.PUBLISHED;
}
