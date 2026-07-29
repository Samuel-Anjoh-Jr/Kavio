import { BadgeType, VerificationTier } from '@kavio/database';
import {
  COMMUNITY_ENDORSED_THRESHOLD,
  earnedBadges,
  type BadgeEvaluationInput,
} from './badge.model';

function state(overrides: Partial<BadgeEvaluationInput> = {}): BadgeEvaluationInput {
  return {
    trustScore: 15,
    tier: VerificationTier.TIER_0,
    completedJobs: 0,
    approvedEndorsements: 0,
    idApproved: false,
    fieldVerified: false,
    suspended: false,
    ...overrides,
  };
}

describe('earnedBadges (TRU-11)', () => {
  it('awards nothing to a brand-new account', () => {
    expect(earnedBadges(state())).toEqual([]);
  });

  it('is idempotent — the same state always yields the same set', () => {
    const input = state({ trustScore: 60, completedJobs: 12, tier: VerificationTier.TIER_2 });

    expect(earnedBadges(input)).toEqual(earnedBadges(input));
  });

  describe('score milestones', () => {
    it('unlocks each threshold as it is passed', () => {
      expect(earnedBadges(state({ trustScore: 24 }))).not.toContain(BadgeType.TRUST_SCORE_25);
      expect(earnedBadges(state({ trustScore: 25 }))).toContain(BadgeType.TRUST_SCORE_25);
    });

    it('keeps every lower milestone at a high score', () => {
      const badges = earnedBadges(state({ trustScore: 92 }));

      expect(badges).toEqual(
        expect.arrayContaining([
          BadgeType.TRUST_SCORE_25,
          BadgeType.TRUST_SCORE_50,
          BadgeType.TRUST_SCORE_75,
          BadgeType.TRUST_SCORE_90,
        ]),
      );
    });
  });

  describe('job milestones', () => {
    it('awards the first job at exactly one', () => {
      expect(earnedBadges(state({ completedJobs: 0 }))).not.toContain(BadgeType.FIRST_JOB);
      expect(earnedBadges(state({ completedJobs: 1 }))).toContain(BadgeType.FIRST_JOB);
    });

    it('collects every milestone passed in one jump', () => {
      // A worker whose history is imported in bulk really did complete those
      // jobs; withholding the earlier badges would misreport their history.
      const badges = earnedBadges(state({ completedJobs: 60 }));

      expect(badges).toEqual(
        expect.arrayContaining([
          BadgeType.FIRST_JOB,
          BadgeType.JOBS_10,
          BadgeType.JOBS_25,
          BadgeType.JOBS_50,
        ]),
      );
      expect(badges).not.toContain(BadgeType.JOBS_100);
    });
  });

  describe('tier badges', () => {
    it('awards the Tier 2 badge at Tier 2', () => {
      expect(earnedBadges(state({ tier: VerificationTier.TIER_2 }))).toContain(
        BadgeType.VERIFIED_PROFESSIONAL,
      );
    });

    it('awards both tier badges at Tier 3 — the ladder was walked', () => {
      const badges = earnedBadges(state({ tier: VerificationTier.TIER_3 }));

      expect(badges).toContain(BadgeType.VERIFIED_PROFESSIONAL);
      expect(badges).toContain(BadgeType.FIELD_VERIFIED_PROFESSIONAL);
    });

    it('awards no tier badge below Tier 2', () => {
      const badges = earnedBadges(state({ tier: VerificationTier.TIER_1 }));

      expect(badges).not.toContain(BadgeType.VERIFIED_PROFESSIONAL);
      expect(badges).not.toContain(BadgeType.FIELD_VERIFIED_PROFESSIONAL);
    });
  });

  it('awards the identity badge once an ID is approved', () => {
    expect(earnedBadges(state({ idApproved: true }))).toContain(BadgeType.IDENTITY_VERIFIED);
  });

  it('awards the community badge at the endorsement threshold (TRU-10)', () => {
    expect(
      earnedBadges(state({ approvedEndorsements: COMMUNITY_ENDORSED_THRESHOLD - 1 })),
    ).not.toContain(BadgeType.COMMUNITY_ENDORSED);

    expect(earnedBadges(state({ approvedEndorsements: COMMUNITY_ENDORSED_THRESHOLD }))).toContain(
      BadgeType.COMMUNITY_ENDORSED,
    );
  });

  describe('suspension (TRU-08)', () => {
    it('unlocks nothing new, whatever the numbers say', () => {
      const badges = earnedBadges(
        state({
          suspended: true,
          trustScore: 95,
          completedJobs: 200,
          tier: VerificationTier.TIER_3,
          idApproved: true,
          approvedEndorsements: 20,
        }),
      );

      expect(badges).toEqual([]);
    });
  });
});
