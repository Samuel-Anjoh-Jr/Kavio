import { TrustEventType, TrustPillar } from '@kavio/database';
import {
  ADMIN_ADJUSTMENT_MAX_MAGNITUDE,
  computeTrustScore,
  crossedThresholds,
  ENDORSEMENT_CAP,
  ENDORSEMENT_POINTS_EACH,
  ENDORSEMENT_TAPERED_OUT_AT,
  endorsementTaper,
  pillarMax,
  subScoreFor,
  TRUST_POINT_MODEL,
  type TrustEventInput,
} from './trust-score.model';

/**
 * The point model is the number a worker's livelihood is ranked on, so every row
 * of SRS §21.5 is pinned here individually. If a rule changes, exactly one of
 * these fails and names the rule — which is the point.
 */

const events = (...types: TrustEventType[]): TrustEventInput[] => types.map((type) => ({ type }));

/** Points a single event type contributes on its own, from a clean slate. */
function pointsFor(...types: TrustEventType[]): number {
  return computeTrustScore(events(...types)).total;
}

describe('trust score point model (SRS §21.5)', () => {
  describe('each rule in the table', () => {
    it('starts a new account at 15', () => {
      expect(pointsFor(TrustEventType.ACCOUNT_CREATED)).toBe(15);
    });

    it('gives +10 for a verified phone', () => {
      expect(pointsFor(TrustEventType.ACCOUNT_CREATED, TrustEventType.PHONE_VERIFIED)).toBe(25);
    });

    it('gives +20 for a verified ID', () => {
      expect(pointsFor(TrustEventType.ACCOUNT_CREATED, TrustEventType.ID_VERIFIED)).toBe(35);
    });

    it('gives +15 for field verification', () => {
      expect(pointsFor(TrustEventType.ACCOUNT_CREATED, TrustEventType.FIELD_VERIFIED)).toBe(30);
    });

    it('gives +10 for a portfolio', () => {
      expect(pointsFor(TrustEventType.ACCOUNT_CREATED, TrustEventType.PORTFOLIO_ADDED)).toBe(25);
    });

    it('accrues completed jobs to a ceiling of +15, reached at the Tier 3 gate of 20 jobs', () => {
      const twenty = events(...Array<TrustEventType>(20).fill(TrustEventType.JOB_COMPLETED));
      expect(computeTrustScore(twenty).total).toBe(15);

      // Past the gate the signal is spent: job 21 buys nothing.
      const forty = events(...Array<TrustEventType>(40).fill(TrustEventType.JOB_COMPLETED));
      expect(computeTrustScore(forty).total).toBe(15);
    });

    it('accrues repeat customers to a ceiling of +10', () => {
      const five = events(...Array<TrustEventType>(5).fill(TrustEventType.REPEAT_CUSTOMER));
      expect(computeTrustScore(five).total).toBe(10);

      const twenty = events(...Array<TrustEventType>(20).fill(TrustEventType.REPEAT_CUSTOMER));
      expect(computeTrustScore(twenty).total).toBe(10);
    });

    it('accrues excellent reviews to a ceiling of +15', () => {
      const ten = events(...Array<TrustEventType>(10).fill(TrustEventType.EXCELLENT_REVIEW));
      expect(computeTrustScore(ten).total).toBe(15);

      const fifty = events(...Array<TrustEventType>(50).fill(TrustEventType.EXCELLENT_REVIEW));
      expect(computeTrustScore(fifty).total).toBe(15);
    });

    it('charges −20 for an upheld dispute', () => {
      const base = events(...Array<TrustEventType>(20).fill(TrustEventType.EXCELLENT_REVIEW));
      // Marketplace sits at its 15-point ceiling, then the dispute takes 20.
      expect(computeTrustScore(base).total).toBe(15);
      expect(computeTrustScore([...base, { type: TrustEventType.DISPUTE_UPHELD }]).total).toBe(0);
    });

    it('charges −10 for a dispute the client raised and lost', () => {
      const base = events(...Array<TrustEventType>(20).fill(TrustEventType.EXCELLENT_REVIEW));
      expect(computeTrustScore(base).total).toBe(15);
      // Half the weight of DISPUTE_UPHELD: a complaint that did not hold up is
      // not the same offence as taking payment and not delivering.
      expect(computeTrustScore([...base, { type: TrustEventType.DISPUTE_LOST }]).total).toBe(5);
    });

    it('prices a lost dispute below an upheld one', () => {
      const base = events(...Array<TrustEventType>(20).fill(TrustEventType.EXCELLENT_REVIEW));
      const lost = computeTrustScore([...base, { type: TrustEventType.DISPUTE_LOST }]).total;
      const upheld = computeTrustScore([...base, { type: TrustEventType.DISPUTE_UPHELD }]).total;
      expect(lost).toBeGreaterThan(upheld);
    });

    it('charges −10 for a cancelled job', () => {
      const base = events(
        ...Array<TrustEventType>(20).fill(TrustEventType.JOB_COMPLETED),
        ...Array<TrustEventType>(5).fill(TrustEventType.REPEAT_CUSTOMER),
      );
      expect(computeTrustScore(base).total).toBe(25);
      expect(computeTrustScore([...base, { type: TrustEventType.JOB_CANCELLED }]).total).toBe(15);
    });
  });

  describe('the suspension rule overrides the numeric score (TRU-08)', () => {
    const maxedOut = events(
      TrustEventType.ACCOUNT_CREATED,
      TrustEventType.PHONE_VERIFIED,
      TrustEventType.ID_VERIFIED,
      TrustEventType.FIELD_VERIFIED,
      TrustEventType.PORTFOLIO_ADDED,
      ...Array<TrustEventType>(30).fill(TrustEventType.JOB_COMPLETED),
      ...Array<TrustEventType>(10).fill(TrustEventType.REPEAT_CUSTOMER),
      ...Array<TrustEventType>(20).fill(TrustEventType.EXCELLENT_REVIEW),
    );

    it('zeroes a fully earned score when documents are confirmed fake', () => {
      const before = computeTrustScore(maxedOut);
      expect(before.total).toBeGreaterThan(90);
      expect(before.suspended).toBe(false);

      const after = computeTrustScore([
        ...maxedOut,
        { type: TrustEventType.FAKE_DOCUMENTS_CONFIRMED },
      ]);

      expect(after.suspended).toBe(true);
      expect(after.total).toBe(0);
    });

    it('zeroes every sub-score too, so no pillar can still look earned', () => {
      const after = computeTrustScore([
        ...maxedOut,
        { type: TrustEventType.FAKE_DOCUMENTS_CONFIRMED },
      ]);

      for (const sub of after.subScores) {
        expect(sub.points).toBe(0);
      }
    });

    it('survives later positive events — suspension is permanent, not a deduction', () => {
      const after = computeTrustScore([
        ...maxedOut,
        { type: TrustEventType.FAKE_DOCUMENTS_CONFIRMED },
        ...Array<TrustEventType>(50)
          .fill(TrustEventType.JOB_COMPLETED)
          .map((type) => ({ type })),
      ]);

      expect(after.suspended).toBe(true);
      expect(after.total).toBe(0);
    });
  });

  describe('clamping', () => {
    it('never exceeds 100 even though the rules sum to more', () => {
      const everything = events(
        TrustEventType.ACCOUNT_CREATED,
        TrustEventType.PHONE_VERIFIED,
        TrustEventType.ID_VERIFIED,
        TrustEventType.FIELD_VERIFIED,
        TrustEventType.PORTFOLIO_ADDED,
        ...Array<TrustEventType>(40).fill(TrustEventType.JOB_COMPLETED),
        ...Array<TrustEventType>(20).fill(TrustEventType.REPEAT_CUSTOMER),
        ...Array<TrustEventType>(30).fill(TrustEventType.EXCELLENT_REVIEW),
        ...Array<TrustEventType>(20).fill(TrustEventType.ENDORSEMENT_RECEIVED),
      );

      const result = computeTrustScore(everything);
      expect(result.total).toBe(100);
    });

    it('never drops below 0 however many penalties land', () => {
      const punished = events(
        TrustEventType.ACCOUNT_CREATED,
        ...Array<TrustEventType>(10).fill(TrustEventType.DISPUTE_UPHELD),
        ...Array<TrustEventType>(10).fill(TrustEventType.JOB_CANCELLED),
      );

      const result = computeTrustScore(punished);
      expect(result.total).toBe(15);
      // The penalties sink Marketplace to its floor, they do not eat Identity.
      expect(subScoreFor(result, TrustPillar.MARKETPLACE).points).toBe(0);
      expect(subScoreFor(result, TrustPillar.IDENTITY).points).toBe(15);
    });

    it('returns 0 for an identity with no events at all', () => {
      expect(computeTrustScore([]).total).toBe(0);
    });
  });

  describe('purity and idempotency', () => {
    const log = events(
      TrustEventType.ACCOUNT_CREATED,
      TrustEventType.PHONE_VERIFIED,
      TrustEventType.ID_VERIFIED,
      ...Array<TrustEventType>(7).fill(TrustEventType.JOB_COMPLETED),
      TrustEventType.DISPUTE_UPHELD,
    );

    it('yields the same score for the same log, every time', () => {
      const first = computeTrustScore(log);
      const second = computeTrustScore(log);
      expect(second).toEqual(first);
    });

    it('does not depend on the order events are replayed in', () => {
      const shuffled = [...log].reverse();
      expect(computeTrustScore(shuffled).total).toBe(computeTrustScore(log).total);
    });

    it('does not mutate the log it is given', () => {
      const snapshot = JSON.stringify(log);
      computeTrustScore(log);
      expect(JSON.stringify(log)).toBe(snapshot);
    });
  });

  describe('the four pillars (§21.6)', () => {
    it('always reports all four, so the breakdown UI never has a hole', () => {
      const result = computeTrustScore([]);
      expect(result.subScores.map((sub) => sub.pillar)).toEqual([
        TrustPillar.IDENTITY,
        TrustPillar.PROFESSIONAL,
        TrustPillar.MARKETPLACE,
        TrustPillar.FINANCIAL,
      ]);
    });

    it('files each rule under the pillar §21.6 assigns it', () => {
      const result = computeTrustScore(
        events(
          TrustEventType.ACCOUNT_CREATED,
          TrustEventType.PHONE_VERIFIED,
          TrustEventType.ID_VERIFIED,
          TrustEventType.FIELD_VERIFIED,
          TrustEventType.PORTFOLIO_ADDED,
          ...Array<TrustEventType>(20).fill(TrustEventType.JOB_COMPLETED),
        ),
      );

      expect(subScoreFor(result, TrustPillar.IDENTITY).points).toBe(45);
      expect(subScoreFor(result, TrustPillar.PROFESSIONAL).points).toBe(25);
      expect(subScoreFor(result, TrustPillar.MARKETPLACE).points).toBe(15);
    });

    it('reports Financial with a zero ceiling until escrow ships', () => {
      expect(pillarMax(TrustPillar.FINANCIAL)).toBe(0);
    });

    it('itemises the inputs behind each sub-score for TRU-04', () => {
      const result = computeTrustScore(
        events(TrustEventType.ACCOUNT_CREATED, TrustEventType.PHONE_VERIFIED),
      );
      const identity = subScoreFor(result, TrustPillar.IDENTITY);

      const phone = identity.contributions.find((c) => c.type === TrustEventType.PHONE_VERIFIED);
      expect(phone).toEqual({
        type: TrustEventType.PHONE_VERIFIED,
        pillar: TrustPillar.IDENTITY,
        occurrences: 1,
        points: 10,
        max: 10,
      });

      // Not yet earned, but still listed — that is what makes it advice.
      const id = identity.contributions.find((c) => c.type === TrustEventType.ID_VERIFIED);
      expect(id?.points).toBe(0);
      expect(id?.max).toBe(20);
    });

    it('sub-scores add up to the total below the clamp', () => {
      const result = computeTrustScore(
        events(TrustEventType.ACCOUNT_CREATED, TrustEventType.PHONE_VERIFIED),
      );
      const summed = result.subScores.reduce((sum, sub) => sum + sub.points, 0);
      expect(summed).toBe(result.total);
    });
  });

  describe('milestones are granted once (ONCE rules)', () => {
    it.each([
      TrustEventType.ACCOUNT_CREATED,
      TrustEventType.PHONE_VERIFIED,
      TrustEventType.ID_VERIFIED,
      TrustEventType.FIELD_VERIFIED,
      TrustEventType.PORTFOLIO_ADDED,
    ])('pays %s only the first time, so a replay cannot inflate it', (type) => {
      const once = computeTrustScore(events(type)).total;
      const thrice = computeTrustScore(events(type, type, type)).total;
      expect(thrice).toBe(once);
    });
  });

  describe('endorsements taper as real job history lands (§21.6, FR-35)', () => {
    const fiveEndorsements = Array<TrustEventType>(5).fill(TrustEventType.ENDORSEMENT_RECEIVED);

    it('gives early credibility to an identity with no completed jobs', () => {
      expect(computeTrustScore(events(...fiveEndorsements)).total).toBe(5);
    });

    it('caps the contribution however many endorsements arrive', () => {
      const twenty = Array<TrustEventType>(20).fill(TrustEventType.ENDORSEMENT_RECEIVED);
      expect(computeTrustScore(events(...twenty)).total).toBe(5);
    });

    it('halves the contribution at the halfway point of the taper', () => {
      const withJobs = events(
        ...fiveEndorsements,
        ...Array<TrustEventType>(5).fill(TrustEventType.JOB_COMPLETED),
      );
      const professional = subScoreFor(computeTrustScore(withJobs), TrustPillar.PROFESSIONAL);
      expect(professional.points).toBe(3); // 5 × (1 − 5/10) = 2.5, rounded away from zero
    });

    it('stops contributing entirely once earned history exists', () => {
      const withJobs = events(
        ...fiveEndorsements,
        ...Array<TrustEventType>(10).fill(TrustEventType.JOB_COMPLETED),
      );
      const professional = subScoreFor(computeTrustScore(withJobs), TrustPillar.PROFESSIONAL);
      expect(professional.points).toBe(0);
    });
  });

  describe('endorsements can be withdrawn without editing history (TRU-10)', () => {
    it('cancels one grant per revocation', () => {
      const log = events(
        TrustEventType.ENDORSEMENT_RECEIVED,
        TrustEventType.ENDORSEMENT_RECEIVED,
        TrustEventType.ENDORSEMENT_RECEIVED,
        TrustEventType.ENDORSEMENT_REVOKED,
      );

      // Three given, one withdrawn — two still standing, one point each.
      expect(subScoreFor(computeTrustScore(log), TrustPillar.PROFESSIONAL).points).toBe(2);
    });

    it('returns the identity to where it started when all are withdrawn', () => {
      const before = computeTrustScore(events(TrustEventType.ACCOUNT_CREATED));
      const after = computeTrustScore(
        events(
          TrustEventType.ACCOUNT_CREATED,
          TrustEventType.ENDORSEMENT_RECEIVED,
          TrustEventType.ENDORSEMENT_REVOKED,
        ),
      );

      expect(after.total).toBe(before.total);
    });

    it('never goes negative when revocations outnumber grants', () => {
      // Withdrawing an endorsement should undo it, not punish the subject for
      // having been endorsed at all.
      const log = events(
        TrustEventType.ENDORSEMENT_RECEIVED,
        TrustEventType.ENDORSEMENT_REVOKED,
        TrustEventType.ENDORSEMENT_REVOKED,
        TrustEventType.ENDORSEMENT_REVOKED,
      );

      expect(subScoreFor(computeTrustScore(log), TrustPillar.PROFESSIONAL).points).toBe(0);
    });

    it('reports the effective occurrence count in the breakdown', () => {
      const log = events(
        TrustEventType.ENDORSEMENT_RECEIVED,
        TrustEventType.ENDORSEMENT_RECEIVED,
        TrustEventType.ENDORSEMENT_REVOKED,
      );

      const professional = subScoreFor(computeTrustScore(log), TrustPillar.PROFESSIONAL);
      const endorsements = professional.contributions.find(
        (contribution) => contribution.type === TrustEventType.ENDORSEMENT_RECEIVED,
      );

      // The breakdown screen must show what currently counts, not the raw
      // number of rows in the ledger.
      expect(endorsements?.occurrences).toBe(1);
    });

    it('leaves the revocation itself scoring nothing of its own', () => {
      const log = computeTrustScore(events(TrustEventType.ENDORSEMENT_REVOKED));

      expect(log.total).toBe(0);
      for (const sub of log.subScores) {
        expect(
          sub.contributions.some(
            (contribution) => contribution.type === TrustEventType.ENDORSEMENT_REVOKED,
          ),
        ).toBe(false);
      }
    });
  });

  describe('endorsement weighting is stated, not buried (TRU-10)', () => {
    it('keeps endorsements worth far less than a verified identity', () => {
      // The ratio IS the requirement: community credibility opens a door, it
      // never substitutes for identity verification or delivered work.
      expect(ENDORSEMENT_CAP).toBeLessThan(20);
      expect(ENDORSEMENT_POINTS_EACH).toBe(1);
    });

    it('tapers on a straight line from full weight to nothing', () => {
      expect(endorsementTaper(0)).toBe(1);
      expect(endorsementTaper(ENDORSEMENT_TAPERED_OUT_AT / 2)).toBe(0.5);
      expect(endorsementTaper(ENDORSEMENT_TAPERED_OUT_AT)).toBe(0);
    });

    it('never goes negative past the taper point', () => {
      expect(endorsementTaper(ENDORSEMENT_TAPERED_OUT_AT * 5)).toBe(0);
    });

    it('taper ends at half the Tier 3 job gate, as documented', () => {
      expect(ENDORSEMENT_TAPERED_OUT_AT).toBe(10);
    });
  });

  describe('tier-gate inputs derived from the same log', () => {
    it('counts completed jobs', () => {
      const result = computeTrustScore(
        events(...Array<TrustEventType>(23).fill(TrustEventType.JOB_COMPLETED)),
      );
      expect(result.completedJobs).toBe(23);
    });
  });

  describe('model integrity', () => {
    it('has a rule for every event type, so no event is silently unscored', () => {
      for (const type of Object.values(TrustEventType)) {
        expect(TRUST_POINT_MODEL[type]).toBeDefined();
      }
    });
  });

  describe('crossedThresholds', () => {
    it('reports each milestone passed on the way up', () => {
      expect(crossedThresholds(48, 76)).toEqual([50, 75]);
    });

    it('reports milestones passed on the way down too', () => {
      expect(crossedThresholds(76, 48)).toEqual([50, 75]);
    });

    it('reports nothing when the score moves within a band', () => {
      expect(crossedThresholds(51, 74)).toEqual([]);
    });

    it('reports nothing when the score does not move', () => {
      expect(crossedThresholds(50, 50)).toEqual([]);
    });

    it('counts a threshold landed on exactly as crossed', () => {
      expect(crossedThresholds(49, 50)).toEqual([50]);
    });
  });

  /**
   * Hiding a review must stop it paying (REV-03). Modelled as a revocation for
   * the same reason endorsements are: the ledger is append-only, so influence is
   * withdrawn by appending its negation rather than by deleting the grant.
   */
  describe('review revocation (REV-03)', () => {
    it('withdraws the points of a hidden review', () => {
      const withReview = pointsFor(TrustEventType.ACCOUNT_CREATED, TrustEventType.EXCELLENT_REVIEW);
      const afterHiding = pointsFor(
        TrustEventType.ACCOUNT_CREATED,
        TrustEventType.EXCELLENT_REVIEW,
        TrustEventType.EXCELLENT_REVIEW_REVOKED,
      );

      expect(withReview).toBeGreaterThan(afterHiding);
      expect(afterHiding).toBe(pointsFor(TrustEventType.ACCOUNT_CREATED));
    });

    it('revokes one review, not the whole history', () => {
      const three = computeTrustScore(
        events(
          TrustEventType.EXCELLENT_REVIEW,
          TrustEventType.EXCELLENT_REVIEW,
          TrustEventType.EXCELLENT_REVIEW,
          TrustEventType.EXCELLENT_REVIEW_REVOKED,
        ),
      );

      const marketplace = subScoreFor(three, TrustPillar.MARKETPLACE);
      const contribution = marketplace.contributions.find(
        (item) => item.type === TrustEventType.EXCELLENT_REVIEW,
      );
      expect(contribution?.occurrences).toBe(2);
    });

    it('never turns a revocation into a debt', () => {
      // More revocations than reviews returns the subject to zero, not below it:
      // moderation removing a review should undo it, not punish having had one.
      const overRevoked = computeTrustScore(
        events(
          TrustEventType.EXCELLENT_REVIEW,
          TrustEventType.EXCELLENT_REVIEW_REVOKED,
          TrustEventType.EXCELLENT_REVIEW_REVOKED,
        ),
      );
      expect(overRevoked.total).toBe(0);
    });
  });

  /**
   * ADM-04 is the one place a human moves a score, and the tests below are what
   * keep it an EVENT rather than an edit: replayable, bounded, and unable to
   * outrank the suspension verdict.
   */
  describe('admin adjustment (ADM-04)', () => {
    const adjustment = (delta: number): TrustEventInput => ({
      type: TrustEventType.ADMIN_ADJUSTMENT,
      delta,
    });

    it('adds a bonus to the total', () => {
      const base = computeTrustScore(events(TrustEventType.ACCOUNT_CREATED));
      const bonused = computeTrustScore([
        ...events(TrustEventType.ACCOUNT_CREATED),
        adjustment(10),
      ]);

      expect(bonused.total).toBe(base.total + 10);
      expect(bonused.adjustment).toBe(10);
    });

    it('subtracts a penalty from the total', () => {
      const penalised = computeTrustScore([
        ...events(TrustEventType.ACCOUNT_CREATED, TrustEventType.ID_VERIFIED),
        adjustment(-20),
      ]);

      // 15 + 20 = 35, less the 20-point penalty.
      expect(penalised.total).toBe(15);
      expect(penalised.adjustment).toBe(-20);
    });

    it('leaves the four pillars untouched', () => {
      const adjusted = computeTrustScore([
        ...events(TrustEventType.ACCOUNT_CREATED),
        adjustment(15),
      ]);

      // The adjustment moves the composite; it does not pretend to be evidence
      // about identity, professionalism, marketplace behaviour or finances.
      for (const pillar of Object.values(TrustPillar)) {
        expect(subScoreFor(adjusted, pillar)).toEqual(
          subScoreFor(computeTrustScore(events(TrustEventType.ACCOUNT_CREATED)), pillar),
        );
      }
    });

    it('bounds a single adjustment to the reviewed maximum', () => {
      // A row that reached the database with an out-of-range delta still cannot
      // move a score further than the model allows.
      const absurd = computeTrustScore([
        ...events(TrustEventType.ACCOUNT_CREATED),
        adjustment(9999),
      ]);
      expect(absurd.adjustment).toBe(ADMIN_ADJUSTMENT_MAX_MAGNITUDE);
    });

    it('accumulates several adjustments', () => {
      const twice = computeTrustScore([
        ...events(TrustEventType.ACCOUNT_CREATED),
        adjustment(10),
        adjustment(-4),
      ]);
      expect(twice.adjustment).toBe(6);
    });

    it('never pushes a score outside the scale', () => {
      const floored = computeTrustScore([
        ...events(TrustEventType.ACCOUNT_CREATED),
        adjustment(-25),
      ]);
      expect(floored.total).toBe(0);

      const capped = computeTrustScore([
        ...events(
          TrustEventType.ACCOUNT_CREATED,
          TrustEventType.PHONE_VERIFIED,
          TrustEventType.ID_VERIFIED,
          TrustEventType.FIELD_VERIFIED,
          TrustEventType.PORTFOLIO_ADDED,
        ),
        adjustment(25),
      ]);
      expect(capped.total).toBeLessThanOrEqual(100);
    });

    it('cannot rescue a suspended identity', () => {
      // Fraud is a verdict, not a number, and a generous adjustment must not be
      // a way around it (TRU-08).
      const suspended = computeTrustScore([
        ...events(TrustEventType.ACCOUNT_CREATED, TrustEventType.FAKE_DOCUMENTS_CONFIRMED),
        adjustment(25),
      ]);

      expect(suspended.suspended).toBe(true);
      expect(suspended.total).toBe(0);
      expect(suspended.adjustment).toBe(0);
    });

    it('stays idempotent under replay', () => {
      const log = [...events(TrustEventType.ACCOUNT_CREATED), adjustment(10)];
      expect(computeTrustScore(log).total).toBe(computeTrustScore([...log].reverse()).total);
    });

    it('reports no adjustment for an identity nobody touched', () => {
      expect(computeTrustScore(events(TrustEventType.ACCOUNT_CREATED)).adjustment).toBe(0);
    });
  });
});
