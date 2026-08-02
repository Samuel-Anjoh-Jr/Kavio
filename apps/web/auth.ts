import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { ApiError } from './lib/api-error';
import {
  apiLogin,
  apiRefresh,
  apiSessionUser,
  apiVerifyOtp,
  apiVerifyTwoFactor,
  type SessionTokens,
} from './lib/auth-api';

/**
 * Auth.js session wiring (ACC-05, ACC-09).
 *
 * The API is the sole authority on credentials: these providers never touch the
 * database, they call the REST auth endpoints and store the resulting token pair
 * in an encrypted, HTTP-only Auth.js JWT cookie. That cookie is what makes a
 * session survive a reload, and the refresh rotation below is what makes it
 * survive longer than one access-token lifetime.
 */

/** Refresh this many seconds BEFORE expiry, to absorb clock skew and latency. */
const REFRESH_SKEW_SECONDS = 30;

/**
 * What Kavio stores in the Auth.js JWT cookie.
 *
 * Declared here rather than by augmenting `next-auth/jwt`: that module is a bare
 * `export *` of `@auth/core/jwt`, whose JWT interface extends
 * `Record<string, unknown>`, so declaration merging does not reach it and every
 * custom claim would silently read back as `unknown`. One explicit type and one
 * cast per callback is both safer and easier to follow.
 */
interface KavioToken {
  userId?: string;
  activeRole?: string;
  roles?: string[];
  tier?: string;
  accessToken?: string;
  refreshToken?: string;
  /** Absolute epoch-ms expiry of the access token, for pre-emptive refresh. */
  accessTokenExpiresAt?: number;
  error?: 'SessionExpired';
}

/**
 * What `useSession().update()` is called with after an action that already
 * minted its own fresh token pair server-side (role switch, role grant) — the
 * same shape the REST endpoint itself returned, so the client does no more
 * than pass it through. The absolute expiry is computed here rather than on
 * the client so that arithmetic never runs inside a component body.
 *
 * Validated defensively per the `jwt` callback's own doc comment ("you should
 * validate this data before using it") — the `session` argument is `any`.
 */
interface TokenPatch {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function isTokenPatch(value: unknown): value is TokenPatch {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidate.refreshToken === 'string' &&
    typeof candidate.expiresIn === 'number'
  );
}

/**
 * Surfaced to the sign-in form so it can distinguish "wrong password" from
 * "now enter your second factor" — both are non-success, only one is an error.
 */
export class AuthActionError extends CredentialsSignin {
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function toTokenState(tokens: SessionTokens) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    // Absolute instant, so the jwt callback never has to guess how much of the
    // lifetime a cached cookie has already burned.
    accessTokenExpiresAt: Date.now() + tokens.expiresIn * 1000,
  };
}

async function toSessionUser(tokens: SessionTokens) {
  const identity = await apiSessionUser(tokens.accessToken);

  return {
    id: identity.id,
    activeRole: identity.activeRole,
    roles: identity.roles,
    tier: identity.tier,
    ...toTokenState(tokens),
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  // The screens themselves are built in P17; pointing at them here means an
  // unauthenticated visit to a protected route lands somewhere sensible.
  pages: { signIn: '/auth/login', error: '/auth/login' },
  providers: [
    /** Phone/email + password. */
    Credentials({
      id: 'password',
      name: 'Password',
      credentials: {
        identifier: { label: 'Phone or email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const identifier = String(credentials?.identifier ?? '');
        const password = String(credentials?.password ?? '');

        if (!identifier || !password) {
          throw new AuthActionError('INVALID_CREDENTIALS');
        }

        try {
          const result = await apiLogin(identifier, password);

          if (result.twoFactorRequired) {
            // Credentials were right, but no session is issued yet. The form
            // reads this code and routes to the 2FA screen rather than showing
            // "invalid password", which would be simply untrue.
            throw new AuthActionError('TWO_FACTOR_REQUIRED');
          }

          return await toSessionUser(result);
        } catch (error) {
          throw toAuthError(error);
        }
      },
    }),

    /**
     * Passwordless sign-in / phone verification. The same code that verifies a
     * new account also signs an existing one in, which is what the phone-first
     * Cameroonian onboarding needs.
     */
    Credentials({
      id: 'otp',
      name: 'One-time code',
      credentials: {
        identifier: { label: 'Phone or email', type: 'text' },
        code: { label: 'Code', type: 'text' },
        purpose: { label: 'Purpose', type: 'text' },
      },
      async authorize(credentials) {
        const identifier = String(credentials?.identifier ?? '');
        const code = String(credentials?.code ?? '');
        const purpose = credentials?.purpose === 'LOGIN' ? 'LOGIN' : 'PHONE_VERIFICATION';

        if (!identifier || !code) {
          throw new AuthActionError('INVALID_CODE');
        }

        try {
          return await toSessionUser(await apiVerifyOtp(identifier, code, purpose));
        } catch (error) {
          throw toAuthError(error);
        }
      },
    }),

    /** Completes a login that stopped at the second factor. */
    Credentials({
      id: 'two-factor',
      name: 'Two-factor code',
      credentials: {
        identifier: { label: 'Phone or email', type: 'text' },
        code: { label: 'Code', type: 'text' },
      },
      async authorize(credentials) {
        const identifier = String(credentials?.identifier ?? '');
        const code = String(credentials?.code ?? '');

        if (!identifier || !code) {
          throw new AuthActionError('INVALID_CODE');
        }

        try {
          return await toSessionUser(await apiVerifyTwoFactor(identifier, code));
        } catch (error) {
          throw toAuthError(error);
        }
      },
    }),
  ],

  callbacks: {
    /**
     * Runs on sign-in and on every session read. This is where rotation lives:
     * an access token near expiry is exchanged for a fresh pair before any
     * caller ever sees an expired one.
     */
    async jwt({ token: rawToken, user, trigger, session }) {
      const token = rawToken as KavioToken & typeof rawToken;

      if (user) {
        return {
          ...token,
          userId: user.id,
          activeRole: user.activeRole,
          roles: user.roles,
          tier: user.tier,
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          accessTokenExpiresAt: user.accessTokenExpiresAt,
          error: undefined,
        };
      }

      // A role switch or grant (POST /auth/roles/switch or /auth/roles) mints
      // its own fresh, already-correct token pair server-side, and the caller
      // passes it straight into `update()`. Adopting it here directly — rather
      // than discarding it and refreshing the OLD token/family below — matters
      // because that OLD refresh token is single-use and rotation results are
      // cached per-token for a short window (SessionService.refresh): a refresh
      // of the old token that happens to land on a cached pre-switch result
      // would silently keep the previous role active despite the DB already
      // having changed, which is exactly the "toast said it switched, nothing
      // actually changed" failure this replaces.
      if (trigger === 'update' && isTokenPatch(session)) {
        try {
          const identity = await apiSessionUser(session.accessToken);
          return {
            ...token,
            userId: identity.id,
            activeRole: identity.activeRole,
            roles: identity.roles,
            tier: identity.tier,
            ...toTokenState({ ...session, tokenType: 'Bearer' }),
            error: undefined,
          };
        } catch {
          return { ...token, accessToken: undefined, error: 'SessionExpired' as const };
        }
      }

      const expiresAt = token.accessTokenExpiresAt ?? 0;
      const stillFresh = Date.now() < expiresAt - REFRESH_SKEW_SECONDS * 1000;

      // `update` is how a role switch pushes its new token pair into the cookie
      // without a full re-login (ACC-07).
      if (stillFresh && trigger !== 'update') {
        return token;
      }

      if (!token.refreshToken) {
        return { ...token, error: 'SessionExpired' as const };
      }

      try {
        const refreshed = await apiRefresh(token.refreshToken);
        const identity = await apiSessionUser(refreshed.accessToken);

        return {
          ...token,
          userId: identity.id,
          // Re-read on refresh, so a role switch or a tier upgrade reaches the
          // session without waiting for the user to sign in again.
          activeRole: identity.activeRole,
          roles: identity.roles,
          tier: identity.tier,
          ...toTokenState(refreshed),
          error: undefined,
        };
      } catch (error) {
        // console rather than lib/logger: that module is 'use client', and
        // pulling it in here would drag this server-only file across the client
        // boundary. Only the error CODE is logged — never a token.
        console.warn(
          JSON.stringify({
            level: 'warn',
            scope: 'auth',
            msg: 'Token refresh failed — session ended',
            code: error instanceof ApiError ? error.code : 'UNKNOWN',
            timestamp: new Date().toISOString(),
          }),
        );

        // The refresh token is dead (revoked, rotated-and-replayed, or expired).
        // This is the ONE place a genuine "session expired" originates.
        return { ...token, accessToken: undefined, error: 'SessionExpired' as const };
      }
    },

    session({ session, token: rawToken }) {
      const token = rawToken as KavioToken;

      session.user.id = token.userId ?? '';
      session.user.activeRole = token.activeRole ?? '';
      session.user.roles = token.roles ?? [];
      session.user.tier = token.tier ?? '';
      // Exposed so server components can call the API on the user's behalf.
      session.accessToken = token.accessToken;
      session.error = token.error;

      return session;
    },
  },
});

/**
 * Maps an API failure onto an Auth.js error code. The code — not a message — is
 * what crosses this boundary, so the UI renders it from the EN/FR catalogue and
 * no English string is ever hardcoded into an auth screen (NFR-I18N-01).
 */
function toAuthError(error: unknown): CredentialsSignin {
  if (error instanceof AuthActionError) {
    return error;
  }

  if (error instanceof ApiError) {
    return new AuthActionError(error.code);
  }

  return new AuthActionError('UNKNOWN_ERROR');
}
