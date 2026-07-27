/**
 * Search filter state, encoded in the URL (DIS-07, DIS-08).
 *
 * The URL is the single source of truth for what the results list is showing.
 * That is not a stylistic preference: it is what makes a filtered search
 * shareable ("here are the verified welders near Bonabéri"), what makes the
 * browser Back button undo a filter instead of leaving the screen, and what
 * makes a reload keep the user where they were on a connection that drops.
 *
 * Pure functions with no React and no `window`, so the server component that
 * renders results and the client component that edits them read the identical
 * state from the identical parser.
 */

import { clampRadius, DEFAULT_RADIUS_M, isValidCoordinate } from './geo-core';

export type VerificationTier = 'TIER_0' | 'TIER_1' | 'TIER_2' | 'TIER_3';

/** Result orderings the search backend accepts (see SearchResolver `sort`). */
export const SORT_OPTIONS = ['relevance', 'distance', 'trust', 'price'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const DEFAULT_SORT: SortOption = 'relevance';
export const PAGE_SIZE = 20;

export interface SearchFilters {
  query: string | null;
  categorySlug: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  minPrice: number | null;
  maxPrice: number | null;
  minTrustScore: number | null;
  minTier: VerificationTier | null;
  minRating: number | null;
  verifiedOnly: boolean;
  availableDay: number | null;
  availableTime: string | null;
  availableDate: string | null;
  sort: SortOption;
  /** Results requested so far. Encoded so a shared deep link restores the page. */
  limit: number;
}

export const EMPTY_FILTERS: SearchFilters = {
  query: null,
  categorySlug: null,
  latitude: null,
  longitude: null,
  radiusM: DEFAULT_RADIUS_M,
  minPrice: null,
  maxPrice: null,
  minTrustScore: null,
  minTier: null,
  minRating: null,
  verifiedOnly: false,
  availableDay: null,
  availableTime: null,
  availableDate: null,
  sort: DEFAULT_SORT,
  limit: PAGE_SIZE,
};

/**
 * URL parameter names. Short because these end up in a link somebody pastes
 * into WhatsApp, and stable because saved searches store the querystring
 * verbatim — renaming a key here silently breaks every saved search.
 */
const KEYS = {
  query: 'q',
  categorySlug: 'cat',
  latitude: 'lat',
  longitude: 'lng',
  radiusM: 'r',
  minPrice: 'pmin',
  maxPrice: 'pmax',
  minTrustScore: 'trust',
  minTier: 'tier',
  minRating: 'rating',
  verifiedOnly: 'verified',
  availableDay: 'day',
  availableTime: 'time',
  availableDate: 'date',
  sort: 'sort',
  limit: 'n',
} as const;

const TIERS: readonly string[] = ['TIER_0', 'TIER_1', 'TIER_2', 'TIER_3'];

/** A querystring is user-supplied input; every reader below validates, never trusts. */
type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(params: ParamSource, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key);
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function readInt(params: ParamSource, key: string, min: number, max: number): number | null {
  const raw = read(params, key);
  if (raw === null || raw.trim() === '') return null;

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

function readFloat(params: ParamSource, key: string, min: number, max: number): number | null {
  const raw = read(params, key);
  if (raw === null || raw.trim() === '') return null;

  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

/** Parses filter state out of a URL. Anything unparseable falls back to unset. */
export function parseFilters(params: ParamSource): SearchFilters {
  const latitude = readFloat(params, KEYS.latitude, -90, 90);
  const longitude = readFloat(params, KEYS.longitude, -180, 180);
  const hasOrigin = isValidCoordinate(latitude, longitude);

  const rawQuery = read(params, KEYS.query);
  const query = rawQuery?.trim() ? rawQuery.trim().slice(0, 100) : null;

  const rawCategory = read(params, KEYS.categorySlug);
  // Slugs are the admin taxonomy's own keys (DIS-05); anything else is noise.
  const categorySlug = rawCategory && /^[a-z0-9-]{1,64}$/.test(rawCategory) ? rawCategory : null;

  const rawTier = read(params, KEYS.minTier);
  const minTier = rawTier && TIERS.includes(rawTier) ? (rawTier as VerificationTier) : null;

  const rawSort = read(params, KEYS.sort);
  const sort = (SORT_OPTIONS as readonly string[]).includes(rawSort ?? '')
    ? (rawSort as SortOption)
    : DEFAULT_SORT;

  const rawTime = read(params, KEYS.availableTime);
  const availableTime = rawTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : null;

  const rawDate = read(params, KEYS.availableDate);
  const availableDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

  const minPrice = readInt(params, KEYS.minPrice, 0, 100_000_000);
  const maxPrice = readInt(params, KEYS.maxPrice, 0, 100_000_000);

  return {
    query,
    categorySlug,
    latitude: hasOrigin ? latitude : null,
    longitude: hasOrigin ? longitude : null,
    radiusM: clampRadius(readInt(params, KEYS.radiusM, 0, Number.MAX_SAFE_INTEGER)),
    // An inverted range returns nothing and looks like a broken filter rather
    // than a mistyped one, so the bounds are swapped back into sanity.
    minPrice: minPrice !== null && maxPrice !== null ? Math.min(minPrice, maxPrice) : minPrice,
    maxPrice: minPrice !== null && maxPrice !== null ? Math.max(minPrice, maxPrice) : maxPrice,
    minTrustScore: readInt(params, KEYS.minTrustScore, 0, 100),
    minTier,
    minRating: readFloat(params, KEYS.minRating, 0, 5),
    verifiedOnly: read(params, KEYS.verifiedOnly) === '1',
    availableDay: readInt(params, KEYS.availableDay, 0, 6),
    availableTime,
    availableDate,
    sort,
    // Bounded so a hand-edited `n=100000` cannot turn one link into a scrape.
    limit: readInt(params, KEYS.limit, PAGE_SIZE, PAGE_SIZE * 10) ?? PAGE_SIZE,
  };
}

/**
 * Serialises filters back to a querystring, omitting everything at its default.
 *
 * Omitting defaults is what keeps a shared link readable and, more importantly,
 * keeps two identical searches producing one identical URL — otherwise Back
 * navigation walks through states that look the same and confuse people.
 */
export function serialiseFilters(filters: SearchFilters): string {
  const params = new URLSearchParams();

  if (filters.query) params.set(KEYS.query, filters.query);
  if (filters.categorySlug) params.set(KEYS.categorySlug, filters.categorySlug);

  if (isValidCoordinate(filters.latitude, filters.longitude)) {
    params.set(KEYS.latitude, String(filters.latitude));
    params.set(KEYS.longitude, String(filters.longitude));
    if (filters.radiusM !== DEFAULT_RADIUS_M) params.set(KEYS.radiusM, String(filters.radiusM));
  }

  if (filters.minPrice !== null) params.set(KEYS.minPrice, String(filters.minPrice));
  if (filters.maxPrice !== null) params.set(KEYS.maxPrice, String(filters.maxPrice));
  if (filters.minTrustScore !== null) params.set(KEYS.minTrustScore, String(filters.minTrustScore));
  if (filters.minTier) params.set(KEYS.minTier, filters.minTier);
  if (filters.minRating !== null) params.set(KEYS.minRating, String(filters.minRating));
  if (filters.verifiedOnly) params.set(KEYS.verifiedOnly, '1');
  if (filters.availableDay !== null) params.set(KEYS.availableDay, String(filters.availableDay));
  if (filters.availableTime) params.set(KEYS.availableTime, filters.availableTime);
  if (filters.availableDate) params.set(KEYS.availableDate, filters.availableDate);
  if (filters.sort !== DEFAULT_SORT) params.set(KEYS.sort, filters.sort);
  if (filters.limit !== PAGE_SIZE) params.set(KEYS.limit, String(filters.limit));

  return params.toString();
}

/**
 * How many filters the user actively applied — the number on the apply control
 * (DIS-07).
 *
 * The free-text query and the sort order are deliberately NOT counted. Neither
 * is something you "clear" from the filter drawer, and counting them would put
 * a "2" on the badge of a search with no filters on it at all.
 *
 * Location counts as one, not two: a user set "near here", not a latitude and a
 * longitude.
 */
export function activeFilterCount(filters: SearchFilters): number {
  let count = 0;

  if (filters.categorySlug) count += 1;
  if (isValidCoordinate(filters.latitude, filters.longitude)) count += 1;
  if (filters.minPrice !== null || filters.maxPrice !== null) count += 1;
  if (filters.minTrustScore !== null) count += 1;
  if (filters.minTier) count += 1;
  if (filters.minRating !== null) count += 1;
  if (filters.verifiedOnly) count += 1;
  if (filters.availableDay !== null || filters.availableDate !== null) count += 1;

  return count;
}

/**
 * Clears the filters while keeping what the user is looking FOR and WHERE.
 *
 * Wiping the location too would answer "clear filters" by widening the search to
 * the whole country, which is never what the button means.
 */
export function clearFilters(filters: SearchFilters): SearchFilters {
  return {
    ...EMPTY_FILTERS,
    query: filters.query,
    latitude: filters.latitude,
    longitude: filters.longitude,
    radiusM: filters.radiusM,
    sort: filters.sort,
  };
}

/** Variables for SEARCH_WORKERS_QUERY. Nulls are dropped so unset means unset. */
export function toSearchVariables(filters: SearchFilters): Record<string, unknown> {
  const variables: Record<string, unknown> = {
    limit: filters.limit,
    offset: 0,
    sort: filters.sort,
  };

  const optional: Record<string, unknown> = {
    query: filters.query,
    categorySlug: filters.categorySlug,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    minTrustScore: filters.minTrustScore,
    minTier: filters.minTier,
    minRating: filters.minRating,
    availableDay: filters.availableDay,
    availableTime: filters.availableTime,
    availableDate: filters.availableDate,
  };

  for (const [key, value] of Object.entries(optional)) {
    if (value !== null && value !== undefined) variables[key] = value;
  }

  if (filters.verifiedOnly) variables.verifiedOnly = true;

  if (isValidCoordinate(filters.latitude, filters.longitude)) {
    variables.latitude = filters.latitude;
    variables.longitude = filters.longitude;
    variables.radiusM = filters.radiusM;
  }

  return variables;
}
