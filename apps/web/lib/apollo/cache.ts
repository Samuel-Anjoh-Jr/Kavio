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
    },
  });
}
