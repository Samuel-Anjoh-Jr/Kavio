/**
 * A short, loggable description of an unknown thrown value.
 *
 * The logger accepts a full `error` (with stack) on `error()` but not on
 * `warn()` — deliberately, since a warn is a recovered degradation and not
 * something anyone should be reading a stack trace for. This is what you pass
 * in `payload` at warn level: enough to tell a timeout from a 429 from a DNS
 * failure, and nothing more.
 */
export function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
