/**
 * Allowed origins for the WHOLE backend — the HTTP surface (REST + GraphQL,
 * wired in main.ts) and the realtime WebSocket gateways alike (SRS NFR-SEC).
 *
 * CORS_ALLOWED_ORIGINS (comma-separated) overrides the default, which is
 * derived from the web app's own configured origins, so a browser tab on
 * Kavio can always reach the API without either surface trusting an
 * arbitrary origin.
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
export function getAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.CORS_ALLOWED_ORIGINS?.trim();
  const candidates = raw
    ? raw.split(',')
    : DEFAULT_ORIGIN_ENV_VARS.map((key) => env[key]).filter((v): v is string => Boolean(v));

  const origins = candidates.map(toOrigin).filter((origin): origin is string => origin !== null);
  return [...new Set(origins)];
}
