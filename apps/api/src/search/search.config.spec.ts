import { VerificationTier } from '@trustpro/database';
import { VERIFIED_MIN_TIER } from './search.config';

describe('VERIFIED_MIN_TIER', () => {
  it('never lets a confirmed phone number alone count as "verified"', () => {
    // The rule, not the value: Tier 1 proves somebody held a SIM card. If this
    // ever drops to TIER_1 or TIER_0, the verified badge starts meaning
    // something a fraudster can obtain in ninety seconds.
    const tiers = [
      VerificationTier.TIER_0,
      VerificationTier.TIER_1,
      VerificationTier.TIER_2,
      VerificationTier.TIER_3,
    ];

    expect(tiers.indexOf(VERIFIED_MIN_TIER)).toBeGreaterThan(
      tiers.indexOf(VerificationTier.TIER_1),
    );
  });

  it('is the tier the VERIFIED_PROFESSIONAL badge is awarded at', () => {
    // The badge and the search filter must never disagree about what the word
    // means — a profile badged "Verified professional" that a verified-only
    // search excludes is a contradiction the user sees before we do.
    expect(VERIFIED_MIN_TIER).toBe(VerificationTier.TIER_2);
  });
});
