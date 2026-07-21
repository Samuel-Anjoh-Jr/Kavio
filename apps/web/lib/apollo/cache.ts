import { InMemoryCache } from '@apollo/client-integration-nextjs';

/**
 * Shared normalized-cache configuration. Apollo's cache is the read
 * single-source-of-truth (CLAUDE.md DUAL API RULE), so server and browser
 * clients must normalize identically or a value written by one would not be
 * found by the other.
 */
export function createCache(): InMemoryCache {
  return new InMemoryCache({
    typePolicies: {
      // `me` and `onboarding` are singletons per session: keying them by the
      // query root rather than an id means a role switch or an autosave writes
      // straight over the previous value instead of accumulating stale copies.
      Query: {
        fields: {
          me: { merge: true },
          onboarding: { merge: true },
        },
      },

      // Trust reads are per-identity, not per-session: the same worker's score
      // can be on screen in a search result, a profile header and the breakdown
      // screen at once, and all three must be the SAME cache object so a tier
      // change updates every one of them.
      TrustScoreView: { keyFields: ['subjectId'] },
      TrustBreakdownView: { keyFields: ['subjectId'] },
      TierStatusView: { keyFields: ['subjectId'] },

      // Sub-scores and contributions have no identity of their own — they are
      // values belonging to the breakdown that contains them. Left normalizable,
      // every subject's IDENTITY pillar would collide on the same cache key.
      TrustSubScoreView: { keyFields: false },
      TrustContributionView: { keyFields: false },
      TierRequirementView: { keyFields: false },
    },
  });
}
