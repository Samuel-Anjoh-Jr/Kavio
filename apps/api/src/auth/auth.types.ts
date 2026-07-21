import type { Role, UserStatus, VerificationTier } from '@trustpro/database';

/**
 * The authenticated identity attached to every request by JwtAuthGuard, built
 * entirely from verified access-token claims (no database read on the hot path).
 */
export interface AuthenticatedUser {
  id: string;
  /** The role this request is acting as — the basis for every RBAC decision. */
  activeRole: Role;
  /** All granted roles, so a role switch never re-authenticates (ACC-06/07). */
  roles: Role[];
  /** Identity-level verification tier, never per-role. */
  tier: VerificationTier;
  status: UserStatus;
  /** Session family id, for correlating logs with a refresh lineage. */
  sessionId: string;
}

/** The token pair handed to a client on login, verification or refresh. */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires — lets the client pre-emptively refresh. */
  expiresIn: number;
  tokenType: 'Bearer';
}
