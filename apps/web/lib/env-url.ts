/**
 * Normalises a URL read from `process.env`: trims whitespace, strips a pair of
 * wrapping quotes (from a `.env`-style `KEY="value"` line pasted verbatim into
 * a dashboard's env var field, which — unlike a shell/dotenv parser — does not
 * strip them), and drops a trailing slash. Falls back to `fallback` when the
 * result is empty or not a valid URL, rather than letting a malformed value
 * reach `new URL()` deeper in the call stack (e.g. Next's `metadataBase`) and
 * fail the build with `ERR_INVALID_URL`.
 */
export function normalizeEnvUrl(value: string | undefined, fallback: string): string {
  const unwrapped = value
    ?.trim()
    .replace(/^["']|["']$/g, '')
    .trim();
  const candidate = unwrapped || fallback;

  try {
    new URL(candidate);
  } catch {
    return fallback;
  }

  return candidate.replace(/\/$/, '');
}
