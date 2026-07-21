import { io, type Socket } from 'socket.io-client';

/**
 * Browser WebSocket client factory (PROMPT 71; SRS §13, §16).
 *
 * Connects to one of the API's socket.io namespaces (`/messaging`, `/tracking`),
 * authenticating with the current access token in `auth.token` — the same token
 * the REST/GraphQL calls carry, verified by the gateway with the same
 * TokenService. Nothing here is authoritative: sockets carry live updates, and
 * every state-changing action still goes through REST (the DUAL API RULE).
 */

/** Where the socket server lives. Falls back to the API origin, then localhost. */
function socketBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  );
}

export type RealtimeNamespace = '/messaging' | '/tracking';

export interface RealtimeSocketOptions {
  /** The current access token; re-created when it rotates. */
  token: string;
  /** Extra socket.io options (reconnection tuning, transports). */
  overrides?: Parameters<typeof io>[1];
}

/**
 * Opens a socket to `namespace`. Reconnection is on by default so a dropped
 * connection (a tunnel through a Douala cell handover) recovers on its own; the
 * caller closes it on unmount.
 */
export function createRealtimeSocket(
  namespace: RealtimeNamespace,
  { token, overrides }: RealtimeSocketOptions,
): Socket {
  return io(`${socketBaseUrl()}${namespace}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    autoConnect: true,
    ...overrides,
  });
}

export type { Socket };
