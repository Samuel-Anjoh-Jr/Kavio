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
