import { getAllowedOrigins } from '../lib/cors.config';

/**
 * `cors` option for a `@WebSocketGateway()` decorator, built from the same
 * allowlist as the HTTP surface (see `../lib/cors.config`). Falls back to
 * `false` (reject every cross-origin handshake) when no origin could be
 * resolved, rather than silently reopening the gateway to any origin.
 */
export function wsCorsOptions(env: NodeJS.ProcessEnv = process.env): { origin: string[] | false } {
  const origins = getAllowedOrigins(env);
  return { origin: origins.length > 0 ? origins : false };
}
