/**
 * Allowed origins for the realtime WebSocket gateways (SRS NFR-SEC).
 *
 * `cors: { origin: true }` reflects whatever `Origin` header the client sends,
 * which lets any site open a socket against Kavio's realtime endpoints. This
 * builds an explicit allowlist instead: CORS_ALLOWED_ORIGINS (comma-separated)
 * overrides the default, which is derived from the web app's own configured
 * origins, so a browser tab on Kavio can always reach its gateways without the
 * gateway trusting an arbitrary origin.
 *
 * Values are normalised to `scheme://host[:port]` (path/query/trailing slash
 * dropped, surrounding quotes/whitespace from a copy-pasted .env line
 * tolerated) so "https://kavio-web-xi.vercel.app" and
 * "https://kavio-web-xi.vercel.app/some/path" allowlist the same origin.
 */

const DEFAULT_ORIGIN_ENV_VARS = [
  'NEXT_PUBLIC_SITE_URL',
  'APP_BASE_URL',
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_WS_URL',
] as const;

function toOrigin(value: string): string | null {
  const unwrapped = value.trim().replace(/^["']|["']$/g, '');
  if (!unwrapped) {
    return null;
  }
  try {
    return new URL(unwrapped).origin;
  } catch {
    return null;
  }
}

/** The deduplicated allowlist, empty when nothing valid was configured. */
export function getAllowedWsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.CORS_ALLOWED_ORIGINS?.trim();
  const candidates = raw
    ? raw.split(',')
    : DEFAULT_ORIGIN_ENV_VARS.map((key) => env[key]).filter((v): v is string => Boolean(v));

  const origins = candidates.map(toOrigin).filter((origin): origin is string => origin !== null);
  return [...new Set(origins)];
}

/**
 * `cors` option for a `@WebSocketGateway()` decorator. Falls back to `false`
 * (reject every cross-origin handshake) when no origin could be resolved,
 * rather than silently reopening the gateway to any origin.
 */
export function wsCorsOptions(env: NodeJS.ProcessEnv = process.env): { origin: string[] | false } {
  const origins = getAllowedWsOrigins(env);
  return { origin: origins.length > 0 ? origins : false };
}
