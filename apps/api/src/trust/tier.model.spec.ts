import { VerificationCheckType, VerificationTier } from '@trustpro/database';
import { deriveTier, evaluateGate, type TierDerivationInput, type TierGate } from './tier.model';

/**
 * Tier gates (SRS §21.4). Two properties matter more than any individual case:
 * an identity lands on exactly the tier it has earned, and every boundary comes
 * from TierConfig data rather than from anything hard-coded here.
 */

/** The gates exactly as the trust-engine migration seeds them. */
const SEEDED_GATES: TierGate[] = [
  {
    tier: VerificationTier.TIER_0,
    minScore: 0,
    requiredChecks: [],
    minCompletedJobs: null,
    minAverageRating: null,
  },
  {
    tier: VerificationTier.TIER_1,
    minScore: 0,
    requiredChecks: [VerificationCheckType.PHONE, VerificationCheckType.ID_SUBMITTED],
    minCompletedJobs: null,
    minAverageRating: null,
  },
  {
    tier: VerificationTier.TIER_2,
    minScore: 0,
    requiredChecks: [VerificationCheckType.ID_APPROVED, VerificationCheckType.PORTFOLIO],
    minCompletedJobs: null,
    minAverageRating: null,
  },
  {
    tier: VerificationTier.TIER_3,
    minScore: 0,
    requiredChecks: [VerificationCheckType.FIELD_VERIFICATION],
    minCompletedJobs: 20,
    minAverageRating: 4.8,
  },
];

const BASE: TierDerivationInput = {
  trustScore: 0,
  verifiedChecks: [],
  completedJobs: 0,
  averageRating: null,
  suspended: false,
};

const input = (overrides: Partial<TierDerivationInput>): TierDerivationInput => ({
  ...BASE,
  ...overrides,
});

describe('tier derivation (SRS §21.4)', () => {
  describe('an identity lands in the correct tier at each gate', () => {
    it('starts every new account at Tier 0, Basic', () => {
      expect(deriveTier(BASE, SEEDED_GATES).tier).toBe(VerificationTier.TIER_0);
    });

    it('stays at Tier 0 with a phone but no ID submitted', () => {
      const result = deriveTier(
        input({ verifiedChecks: [VerificationCheckType.PHONE] }),
        SEEDED_GATES,
      );
      expect(result.tier).toBe(VerificationTier.TIER_0);
    });

    it('reaches Tier 1 on phone + ID submitted', () => {
      const result = deriveTier(
        input({
          verifiedChecks: [VerificationCheckType.PHONE, VerificationCheckType.ID_SUBMITTED],
        }),
        SEEDED_GATES,
      );
      expect(result.tier).toBe(VerificationTier.TIER_1);
    });

    it('reaches Tier 2 on ID approved + portfolio', () => {
      const result = deriveTier(
        input({
          verifiedChecks: [
            VerificationCheckType.PHONE,
            VerificationCheckType.ID_SUBMITTED,
            VerificationCheckType.ID_APPROVED,
            VerificationCheckType.PORTFOLIO,
          ],
        }),
        SEEDED_GATES,
      );
      expect(result.tier).toBe(VerificationTier.TIER_2);
    });

    it('reaches Tier 3 on field verification + 20 jobs + 4.8 rating', () => {
      const result = deriveTier(
        input({
          verifiedChecks: [
            VerificationCheckType.PHONE,
            VerificationCheckType.ID_SUBMITTED,
            VerificationCheckType.ID_APPROVED,
            VerificationCheckType.PORTFOLIO,
            VerificationCheckType.FIELD_VERIFICATION,
          ],
          completedJobs: 20,
          averageRating: 4.8,
        }),
        SEEDED_GATES,
      );
      expect(result.tier).toBe(VerificationTier.TIER_3);
      expect(result.nextTier).toBeNull();
      expect(result.unmet).toEqual([]);
    });
  });

  describe('the ladder cannot be skipped', () => {
    const tier3Ready = {
      verifiedChecks: [VerificationCheckType.FIELD_VERIFICATION],
      completedJobs: 40,
      averageRating: 5,
    };

    it('holds a field-verified worker at Tier 0 while the ID gate is unmet', () => {
      // Every Tier 3 requirement is satisfied in isolation; the missing phone/ID
      // below still stops the climb, because the badge means the whole ladder.
      const result = deriveTier(input(tier3Ready), SEEDED_GATES);
      expect(result.tier).toBe(VerificationTier.TIER_0);
      expect(result.nextTier).toBe(VerificationTier.TIER_1);
    });
  });

  describe('changing TierConfig moves the boundary', () => {
    const readyFor3 = input({
      verifiedChecks: [
        VerificationCheckType.PHONE,
        VerificationCheckType.ID_SUBMITTED,
        VerificationCheckType.ID_APPROVED,
        VerificationCheckType.PORTFOLIO,
        VerificationCheckType.FIELD_VERIFICATION,
      ],
      completedJobs: 20,
      averageRating: 4.8,
    });

    it('demotes to Tier 2 when an admin raises the job requirement', () => {
      expect(deriveTier(readyFor3, SEEDED_GATES).tier).toBe(VerificationTier.TIER_3);

      const stricter = SEEDED_GATES.map((gate) =>
        gate.tier === VerificationTier.TIER_3 ? { ...gate, minCompletedJobs: 50 } : gate,
      );

      const result = deriveTier(readyFor3, stricter);
      expect(result.tier).toBe(VerificationTier.TIER_2);
      expect(result.unmet).toContainEqual({
        kind: 'COMPLETED_JOBS',
        required: 50,
        current: 20,
      });
    });

    it('promotes when an admin lowers the rating requirement', () => {
      const barelyRated = input({ ...readyFor3, averageRating: 4.5 });
      expect(deriveTier(barelyRated, SEEDED_GATES).tier).toBe(VerificationTier.TIER_2);

      const looser = SEEDED_GATES.map((gate) =>
        gate.tier === VerificationTier.TIER_3 ? { ...gate, minAverageRating: 4.5 } : gate,
      );
      expect(deriveTier(barelyRated, looser).tier).toBe(VerificationTier.TIER_3);
    });

    it('honours a score threshold added to a gate that had none', () => {
      const withScoreGate = SEEDED_GATES.map((gate) =>
        gate.tier === VerificationTier.TIER_1 ? { ...gate, minScore: 60 } : gate,
      );

      const candidate = input({
        trustScore: 25,
        verifiedChecks: [VerificationCheckType.PHONE, VerificationCheckType.ID_SUBMITTED],
      });

      expect(deriveTier(candidate, SEEDED_GATES).tier).toBe(VerificationTier.TIER_1);
      expect(deriveTier(candidate, withScoreGate).tier).toBe(VerificationTier.TIER_0);
      expect(deriveTier({ ...candidate, trustScore: 60 }, withScoreGate).tier).toBe(
        VerificationTier.TIER_1,
      );
    });

    it('adds a whole new required check when an admin configures one', () => {
      const withSelfie = SEEDED_GATES.map((gate) =>
        gate.tier === VerificationTier.TIER_2
          ? {
              ...gate,
              requiredChecks: [...gate.requiredChecks, VerificationCheckType.SELFIE_LIVENESS],
            }
          : gate,
      );

      const candidate = input({
        verifiedChecks: [
          VerificationCheckType.PHONE,
          VerificationCheckType.ID_SUBMITTED,
          VerificationCheckType.ID_APPROVED,
          VerificationCheckType.PORTFOLIO,
        ],
      });

      expect(deriveTier(candidate, SEEDED_GATES).tier).toBe(VerificationTier.TIER_2);
      expect(deriveTier(candidate, withSelfie).tier).toBe(VerificationTier.TIER_1);
    });
  });

  describe('the tier is derived, never supplied', () => {
    it('takes no tier input at all — the signature has nowhere to put one', () => {
      // TierDerivationInput carries evidence (checks, jobs, rating, score) and
      // nothing else. There is no "currentTier" to honour, so no caller can pin
      // an identity to a tier it has not earned.
      expect(Object.keys(BASE).sort()).toEqual([
        'averageRating',
        'completedJobs',
        'suspended',
        'trustScore',
        'verifiedChecks',
      ]);
    });

    it('re-derives the same tier from the same evidence, however often it runs', () => {
      const candidate = input({
        verifiedChecks: [VerificationCheckType.PHONE, VerificationCheckType.ID_SUBMITTED],
      });
      const first = deriveTier(candidate, SEEDED_GATES);
      expect(deriveTier(candidate, SEEDED_GATES)).toEqual(first);
    });

    it('drops the tier again when a check stops being verified', () => {
      const verified = input({
        verifiedChecks: [VerificationCheckType.PHONE, VerificationCheckType.ID_SUBMITTED],
      });
      expect(deriveTier(verified, SEEDED_GATES).tier).toBe(VerificationTier.TIER_1);

      const revoked = input({ verifiedChecks: [VerificationCheckType.PHONE] });
      expect(deriveTier(revoked, SEEDED_GATES).tier).toBe(VerificationTier.TIER_0);
    });
  });

  describe('what the next tier still needs (TRU-05)', () => {
    it('names the outstanding checks for the tier immediately above', () => {
      const result = deriveTier(
        input({ verifiedChecks: [VerificationCheckType.PHONE] }),
        SEEDED_GATES,
      );

      expect(result.nextTier).toBe(VerificationTier.TIER_1);
      expect(result.unmet).toEqual([
        {
          kind: 'CHECK',
          checkType: VerificationCheckType.ID_SUBMITTED,
          required: 'VERIFIED',
          current: 'NOT_VERIFIED',
        },
      ]);
    });

    it('reports every unmet requirement at once, not just the first', () => {
      const result = deriveTier(
        input({
          verifiedChecks: [
            VerificationCheckType.PHONE,
            VerificationCheckType.ID_SUBMITTED,
            VerificationCheckType.ID_APPROVED,
            VerificationCheckType.PORTFOLIO,
          ],
          completedJobs: 3,
        }),
        SEEDED_GATES,
      );

      expect(result.tier).toBe(VerificationTier.TIER_2);
      expect(result.unmet.map((requirement) => requirement.kind).sort()).toEqual([
        'AVERAGE_RATING',
        'CHECK',
        'COMPLETED_JOBS',
      ]);
    });
  });

  describe('unrated identities', () => {
    it('treats a missing rating as unmet rather than as a pass', () => {
      const tier3Gate = SEEDED_GATES.find((gate) => gate.tier === VerificationTier.TIER_3)!;
      const unmet = evaluateGate(tier3Gate, input({ averageRating: null, completedJobs: 20 }));
      expect(unmet).toContainEqual({ kind: 'AVERAGE_RATING', required: 4.8, current: 0 });
    });
  });

  describe('suspension collapses the ladder (TRU-08)', () => {
    it('forces Tier 0 however much verification was completed', () => {
      const result = deriveTier(
        input({
          suspended: true,
          verifiedChecks: [
            VerificationCheckType.PHONE,
            VerificationCheckType.ID_SUBMITTED,
            VerificationCheckType.ID_APPROVED,
            VerificationCheckType.PORTFOLIO,
            VerificationCheckType.FIELD_VERIFICATION,
          ],
          completedJobs: 100,
          averageRating: 5,
          trustScore: 100,
        }),
        SEEDED_GATES,
      );

      expect(result.tier).toBe(VerificationTier.TIER_0);
      expect(result.nextTier).toBeNull();
    });
  });

  describe('missing configuration fails closed', () => {
    it('holds everyone at Tier 0 when no gates are configured at all', () => {
      // An unmigrated database must not hand out "Field Verified" for free.
      const result = deriveTier(
        input({
          verifiedChecks: Object.values(VerificationCheckType),
          completedJobs: 100,
          averageRating: 5,
        }),
        [],
      );
      expect(result.tier).toBe(VerificationTier.TIER_0);
    });

    it('stops the climb at the first tier whose gate is missing', () => {
      const partial = SEEDED_GATES.filter((gate) => gate.tier !== VerificationTier.TIER_2);
      const result = deriveTier(
        input({
          verifiedChecks: Object.values(VerificationCheckType),
          completedJobs: 100,
          averageRating: 5,
        }),
        partial,
      );

      expect(result.tier).toBe(VerificationTier.TIER_1);
      expect(result.nextTier).toBe(VerificationTier.TIER_2);
    });
  });
});
