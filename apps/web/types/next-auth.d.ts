import type { DefaultSession } from 'next-auth';

/**
 * Module augmentation for the Kavio session shape. Without this the identity
 * fields the callbacks set would be untyped `any` at every call site, which is
 * exactly where an authorisation mistake hides.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      /** The role this session is acting as — mirrors the activeRole JWT claim. */
      activeRole: string;
      roles: string[];
      /** Verification tier, held on the identity rather than per role. */
      tier: string;
    } & DefaultSession['user'];
    /** Bearer token for calling the API on the user's behalf. */
    accessToken?: string;
    /** Set to "SessionExpired" when refresh failed and re-login is required. */
    error?: 'SessionExpired';
  }

  /** What a provider's `authorize` returns, and the `jwt` callback receives. */
  interface User {
    id: string;
    activeRole: string;
    roles: string[];
    tier: string;
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: number;
  }
}

export {};
