import { UserStatus } from '@kavio/database';
import type { Socket } from 'socket.io';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TokenService } from '../auth/token.service';

/**
 * WebSocket authentication (SRS §13, §16). The HTTP/GraphQL guards do not run on
 * a socket handshake, so every gateway authenticates the connection here from the
 * same access token, using the same TokenService — one verification path, so a
 * socket can never be trusted on weaker terms than a request.
 *
 * The token is read from `handshake.auth.token` (the socket.io convention) with
 * an `Authorization: Bearer` header fallback for clients that cannot set auth.
 */
export function authenticateSocket(socket: Socket, tokens: TokenService): AuthenticatedUser | null {
  const token = extractSocketToken(socket);
  if (!token) {
    return null;
  }

  let claims;
  try {
    claims = tokens.verifyAccessToken(token);
  } catch {
    // A bad or expired token is simply an unauthenticated socket — the gateway
    // disconnects it rather than trusting it.
    return null;
  }

  if (claims.status === UserStatus.SUSPENDED || claims.status === UserStatus.DELETED) {
    return null;
  }

  return {
    id: claims.sub,
    activeRole: claims.activeRole,
    roles: claims.roles ?? [],
    tier: claims.tier,
    status: claims.status,
    sessionId: claims.sid,
  };
}

function extractSocketToken(socket: Socket): string | null {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === 'string' && auth.token.trim()) {
    return auth.token.trim();
  }

  const header = socket.handshake.headers?.authorization;
  if (typeof header === 'string') {
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && value) {
      return value.trim() || null;
    }
  }

  return null;
}

/** The per-identity room every gateway joins a socket to, for presence + targeting. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}
