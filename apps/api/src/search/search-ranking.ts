/**
 * How search results are ordered (PROMPT 44/45; DIS-04, DIS-08, TRU-04).
 *
 * The blend lives HERE, in TypeScript, and is passed into `search.workers()` as
 * parameters rather than being written into the migration. Ranking is the single
 * most consequential product decision in discovery — it decides whose family
 * eats — and it has to be reviewable, testable and tunable without a database
 * migration.
 *
 * Three normalised signals in [0,1]:
 *
 *   relevance  did they ask for THIS trade? (trigram similarity)
 *   proximity  how far away is it? (linear falloff across the radius)
 *   trust      tier first, Trust Score second (mirrors trust-ranking.ts)
 */

export type SearchSort = 'relevance' | 'distance' | 'trust' | 'price';

export const SEARCH_SORTS: readonly SearchSort[] = ['relevance', 'distance', 'trust', 'price'];

export interface RankingWeights {
  relevance: number;
  proximity: number;
  trust: number;
}

/**
 * The default blend.
 *
 * Relevance leads because a beautifully-trusted electrician is a WRONG answer to
 * "plumber" — no amount of verification makes it right, and a search engine that
 * ranks the wrong trade first is the fastest way to teach people the search box
 * does not work.
 *
 * Proximity comes second because this is a physical-services marketplace in two
 * cities with hard traffic: a 4.9-rated plumber across the Wouri is worse than a
 * 4.5 one in the same quarter, and every user knows it.
 *
 * Trust is a quarter of the blend rather than a gate. DIS-08 asks that verified
 * workers be ELIGIBLE for priority placement, not that unverified ones be
 * hidden: at this stage of the marketplace most workers are Tier 0-1, and a
 * ranking that buried them would show an empty city to every early user and give
 * a new worker no path to a first job.
 */
export const DEFAULT_RANKING_WEIGHTS: Readonly<RankingWeights> = {
  relevance: 0.45,
  proximity: 0.3,
  trust: 0.25,
};

/**
 * Weights used when the searcher gave us no location.
 *
 * Proximity is meaningless without an origin — the SQL scores it a neutral 1.0
 * for everyone — so leaving it at 0.3 would add the same constant to every row
 * and quietly compress the real signals into 70% of the range. Its share is
 * redistributed instead, in the same 45:25 proportion.
 */
export const NO_LOCATION_RANKING_WEIGHTS: Readonly<RankingWeights> = {
  relevance: 0.64,
  proximity: 0,
  trust: 0.36,
};

export function weightsFor(hasLocation: boolean): Readonly<RankingWeights> {
  return hasLocation ? DEFAULT_RANKING_WEIGHTS : NO_LOCATION_RANKING_WEIGHTS;
}

/** Falls back to relevance for anything unrecognised, rather than erroring. */
export function normaliseSort(requested: string | null | undefined): SearchSort {
  return SEARCH_SORTS.includes(requested as SearchSort) ? (requested as SearchSort) : 'relevance';
}

/**
 * Shortest query we will run.
 *
 * One character matches most of the catalogue through trigram similarity and
 * teaches the user nothing. The web layer also debounces (DIS-04); this is the
 * server-side floor, because a debounce is a UI courtesy and not a guarantee.
 */
export const MIN_QUERY_LENGTH = 2;

/** Longest query we will accept. Beyond this it is not a search, it is a payload. */
export const MAX_QUERY_LENGTH = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Sponsored slots (business plan: "Featured/Verified Business" tier)
//
// A worker/business pays extra commission to be featured; what that BUYS is a
// modest ranking boost with a small "Sponsored" tag — never a takeover of the
// page. Everything below is deliberately conservative: sponsorship can only
// promote a worker who was ALREADY a genuine match somewhere on this page, it
// is capped to a fraction of the results, and it rotates fairly among sponsors
// rather than always surfacing the same one.
// ─────────────────────────────────────────────────────────────────────────────

export interface SponsoredCandidate {
  userId: string;
  lastShownAt: Date | null;
}

/**
 * The Nth (0-based) sponsored slot's array index: 2, 7, 12, 17, … — 1-indexed
 * positions 3, 8, 13, 18. Computed fresh per insertion, against the array's
 * length AT THAT POINT, which is what makes sequential splicing at these fixed
 * indices behave as "shift everything after this point down by one".
 */
function sponsoredSlotIndex(n: number): number {
  return 2 + 5 * n;
}

/**
 * Interleaves a capped, fairly-rotated set of sponsored workers into an
 * already-ranked results page.
 *
 * Never reorders the organic (non-sponsored) results relative to each other —
 * sponsorship only decides WHERE a handful of already-present matches are
 * highlighted, never who else shows up or in what order they show up in.
 */
export function applySponsoredSlots<T extends { userId: string }>(
  workers: readonly T[],
  sponsored: ReadonlyMap<string, SponsoredCandidate>,
): { workers: (T & { sponsored: boolean })[]; shownUserIds: string[] } {
  if (sponsored.size === 0 || workers.length < 3) {
    return { workers: workers.map((w) => ({ ...w, sponsored: false })), shownUserIds: [] };
  }

  const eligible: T[] = [];
  const rest: T[] = [];
  for (const worker of workers) {
    if (sponsored.has(worker.userId)) {
      eligible.push(worker);
    } else {
      rest.push(worker);
    }
  }

  if (eligible.length === 0) {
    return { workers: workers.map((w) => ({ ...w, sponsored: false })), shownUserIds: [] };
  }

  // The fairness cap: never more than a fifth of the page, and always at
  // least one slot when there is anyone eligible at all.
  const cap = Math.max(1, Math.floor(workers.length / 5));

  const kept =
    eligible.length <= cap
      ? // Room for everyone: keep their existing relative (already-ranked)
        // order rather than reshuffling by rotation cursor — a well-matched
        // sponsor should not be bumped by a stale one when both fit.
        eligible
      : // Over the cap: the rotation cursor decides who gets a slot this time.
        // Null (never shown) sorts first, so a brand-new sponsor always gets a
        // turn before a repeat.
        [...eligible]
          .sort((a, b) => {
            const aShown = sponsored.get(a.userId)?.lastShownAt ?? null;
            const bShown = sponsored.get(b.userId)?.lastShownAt ?? null;
            if (aShown === null && bShown === null) return 0;
            if (aShown === null) return -1;
            if (bShown === null) return 1;
            return aShown.getTime() - bShown.getTime();
          })
          .slice(0, cap);

  const asSponsored = (worker: T): T & { sponsored: boolean } => ({ ...worker, sponsored: true });

  const merged: (T & { sponsored: boolean })[] = rest.map((w) => ({ ...w, sponsored: false }));
  const shownUserIds: string[] = [];

  if (rest.length < 2) {
    // Too little organic content to interleave into: place at most one
    // sponsored worker, near the top but never AT the top.
    const worker = kept[0];
    if (worker) {
      merged.splice(Math.min(2, rest.length), 0, asSponsored(worker));
      shownUserIds.push(worker.userId);
    }
    return { workers: merged, shownUserIds };
  }

  kept.forEach((worker, i) => {
    const targetIndex = Math.min(sponsoredSlotIndex(i), merged.length);
    merged.splice(targetIndex, 0, asSponsored(worker));
    shownUserIds.push(worker.userId);
  });

  return { workers: merged, shownUserIds };
}
