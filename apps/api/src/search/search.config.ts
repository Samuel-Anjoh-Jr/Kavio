import { VerificationTier } from '@trustpro/database';

/**
 * Discovery filter semantics (PROMPT 45; DIS-07, DIS-08).
 *
 * These are PRODUCT decisions, so they live in TypeScript and are passed into
 * the `search` SQL functions as parameters — the same discipline as
 * search-ranking.ts. A threshold written twice inside two migrations is a
 * threshold that will eventually be changed in one of them.
 */

/**
 * The tier at which the UI may call somebody "verified".
 *
 * TIER_2, not TIER_1, and the gap matters more here than anywhere else in the
 * product: Tier 1 is a confirmed PHONE NUMBER, which proves only that somebody
 * held a SIM. Tier 2 is a national ID a human being checked.
 *
 * On a marketplace whose entire moat is trust, letting a phone number earn the
 * verified badge would be the most damaging overclaim available to us — it is
 * the one signal a client is most likely to substitute for their own judgement
 * before letting a stranger into their home. It also matches the
 * VERIFIED_PROFESSIONAL badge, so the badge and the filter can never disagree
 * about what the word means.
 */
export const VERIFIED_MIN_TIER: VerificationTier = VerificationTier.TIER_2;
