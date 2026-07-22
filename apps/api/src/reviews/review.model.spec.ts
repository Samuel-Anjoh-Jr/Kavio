import { BookingStatus, ReviewStatus } from '@trustpro/database';
import {
  countsToward,
  decideReviewEligibility,
  EXCELLENT_REVIEW_MIN_RATING,
  isExcellentReview,
  REVIEWABLE_BOOKING_STATUSES,
  summariseRatings,
  type ReviewEligibilityBooking,
} from './review.model';

const CLIENT = 'client-id';
const WORKER = 'worker-id';
const STRANGER = 'stranger-id';

function booking(status: BookingStatus): ReviewEligibilityBooking {
  return { clientId: CLIENT, workerId: WORKER, status };
}

/**
 * Eligibility is what stands between the Marketplace sub-score and anyone who
 * feels like writing themselves a five-star review, so it is tested by name and
 * across every booking state rather than on the happy path.
 */
describe('review.model — eligibility (REV-02)', () => {
  it('lets each party review the other after a completed job', () => {
    const asClient = decideReviewEligibility(booking(BookingStatus.COMPLETED), CLIENT, false);
    expect(asClient).toEqual({ allowed: true, reason: 'ELIGIBLE', subjectId: WORKER });

    const asWorker = decideReviewEligibility(booking(BookingStatus.COMPLETED), WORKER, false);
    expect(asWorker).toEqual({ allowed: true, reason: 'ELIGIBLE', subjectId: CLIENT });
  });

  it('derives the subject from the booking rather than trusting the caller', () => {
    // The only way to be reviewed is to be the counterparty on a real booking.
    const decision = decideReviewEligibility(booking(BookingStatus.RELEASED), CLIENT, false);
    expect(decision.subjectId).toBe(WORKER);
    expect(decision.subjectId).not.toBe(CLIENT);
  });

  it('refuses a stranger to the booking', () => {
    const decision = decideReviewEligibility(booking(BookingStatus.RELEASED), STRANGER, false);
    expect(decision).toEqual({ allowed: false, reason: 'NOT_A_PARTICIPANT', subjectId: null });
  });

  it('refuses when there is no booking at all', () => {
    expect(decideReviewEligibility(null, CLIENT, false)).toEqual({
      allowed: false,
      reason: 'NO_BOOKING',
      subjectId: null,
    });
  });

  it('refuses a second review of the same job by the same author', () => {
    const decision = decideReviewEligibility(booking(BookingStatus.RELEASED), CLIENT, true);
    expect(decision).toEqual({ allowed: false, reason: 'ALREADY_REVIEWED', subjectId: null });
  });

  it('allows exactly the finished states and refuses every other one', () => {
    const allowed: BookingStatus[] = [];
    const refused: BookingStatus[] = [];

    for (const status of Object.values(BookingStatus)) {
      const decision = decideReviewEligibility(booking(status), CLIENT, false);
      (decision.allowed ? allowed : refused).push(status);
      if (!decision.allowed) {
        expect(decision.reason).toBe('NOT_COMPLETED');
      }
    }

    expect(allowed.sort()).toEqual([...REVIEWABLE_BOOKING_STATUSES].sort());
    // The states a review must never be reachable from: money reversed, work
    // never started, or an argument still being adjudicated.
    expect(refused).toEqual(
      expect.arrayContaining([
        BookingStatus.PENDING_PAYMENT,
        BookingStatus.PAID,
        BookingStatus.ACCEPTED,
        BookingStatus.IN_PROGRESS,
        BookingStatus.CANCELLED,
        BookingStatus.REFUNDED,
        BookingStatus.DISPUTED,
      ]),
    );
  });
});

describe('review.model — excellence threshold (§21.5)', () => {
  it('pays 4 and 5 stars and nothing below', () => {
    expect(isExcellentReview(5)).toBe(true);
    expect(isExcellentReview(4)).toBe(true);
    expect(isExcellentReview(3)).toBe(false);
    expect(isExcellentReview(2)).toBe(false);
    expect(isExcellentReview(1)).toBe(false);
  });

  it('keeps the threshold and the predicate in step', () => {
    expect(isExcellentReview(EXCELLENT_REVIEW_MIN_RATING)).toBe(true);
    expect(isExcellentReview(EXCELLENT_REVIEW_MIN_RATING - 1)).toBe(false);
  });
});

describe('review.model — summary (REV-02)', () => {
  it('reports no average at all when nothing has been rated', () => {
    const summary = summariseRatings(new Map());

    // Null, never 0: an unrated worker must not read as a badly rated one, and
    // the Tier 3 rating gate must stay unmet rather than being met by an absence.
    expect(summary.average).toBeNull();
    expect(summary.total).toBe(0);
    expect(summary.distribution).toHaveLength(5);
    expect(summary.distribution.every((bucket) => bucket.count === 0)).toBe(true);
    expect(summary.distribution.every((bucket) => bucket.share === 0)).toBe(true);
  });

  it('averages, counts and distributes whole-star counts', () => {
    const summary = summariseRatings(
      new Map([
        [5, 6],
        [4, 2],
        [1, 2],
      ]),
    );

    expect(summary.total).toBe(10);
    // (5×6 + 4×2 + 1×2) / 10 = 4
    expect(summary.average).toBe(4);
    expect(summary.distribution).toEqual([
      { rating: 1, count: 2, share: 0.2 },
      { rating: 2, count: 0, share: 0 },
      { rating: 3, count: 0, share: 0 },
      { rating: 4, count: 2, share: 0.2 },
      { rating: 5, count: 6, share: 0.6 },
    ]);
  });

  it('rounds to the two decimals the Tier 3 gate is written in', () => {
    // 14 fives and 1 four = 4.9333… — must not read as 4.93333333333 anywhere
    // near a "≥ 4.8" comparison.
    const summary = summariseRatings(
      new Map([
        [5, 14],
        [4, 1],
      ]),
    );
    expect(summary.average).toBe(4.93);
  });

  it('keeps every bar present so the chart cannot misreport its shape', () => {
    const summary = summariseRatings(new Map([[5, 3]]));
    expect(summary.distribution.map((bucket) => bucket.rating)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('review.model — moderation', () => {
  it('counts published reviews and ignores hidden ones', () => {
    expect(countsToward(ReviewStatus.PUBLISHED)).toBe(true);
    expect(countsToward(ReviewStatus.HIDDEN)).toBe(false);
  });
});
