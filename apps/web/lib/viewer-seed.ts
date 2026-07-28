'use client';

/**
 * A stable, anonymous per-device key used to shuffle equally-ranked workers
 * (DIS-04 fair ranking).
 *
 * Ranking alone is a total order, so without this the same few workers would sit
 * at the top of every search for every visitor forever — and nobody below them
 * could ever earn the jobs that would raise their score. The API groups
 * near-equal results into bands and orders each band by a hash of this value, so
 * one visitor sees a consistent order across refreshes and paging while two
 * visitors see different workers first.
 *
 * ── What this is NOT ────────────────────────────────────────────────────────
 *
 * It is not an identifier. It is a random value the browser mints for itself,
 * never derived from anything about the person, never sent anywhere but our own
 * search call, and never joined to an account. Clearing site data mints a new
 * one, which costs the visitor nothing but a different shuffle.
 */
const STORAGE_KEY = 'trustpro.viewer-seed';

export function getViewerSeed(): string {
  // Server render and any environment without storage (private mode in some
  // browsers throws on access) fall back to an empty seed, which the API reads
  // as "rank strictly". A missing shuffle is a fine degradation; a thrown
  // exception in the search path is not.
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const seed =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '')
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

    window.localStorage.setItem(STORAGE_KEY, seed);
    return seed;
  } catch {
    return '';
  }
}
