'use client';

/**
 * The discovery contract: what a worker card needs, and the small amount of
 * per-visitor state discovery keeps (DIS-02, DIS-10).
 *
 * Saved searches and recently-viewed live in localStorage here, deliberately:
 * both are per-device browsing convenience, not account data, so a guest gets
 * them without signing up (ACC-01). SAVED WORKERS is account data instead —
 * it is a gated action (ACC-02) backed by the server (FavoritesProvider,
 * `myFavorites`), not device-local state, so it follows the signed-in identity
 * to another device rather than staying behind on this one.
 */

import type { NearbyWorkerResult, SearchWorkerResult } from './graphql/discovery';
import type { SavedWorker } from './graphql/favorites';
import type { VerificationTier } from './trust';

/**
 * Everything the Worker Card renders (DIS-02).
 *
 * Both `searchWorkers` and `nearbyWorkers` project into this shape, so one card
 * serves every discovery surface rather than each growing its own variant.
 */
export interface WorkerCardData {
  workerProfileId: string;
  /** The identity. Trust attaches here, and this is what the profile URL uses. */
  userId: string;
  name: string | null;
  avatar: string | null;
  headline: string | null;
  city: string | null;
  area: string | null;
  tier: VerificationTier;
  trustScore: number;
  completedJobs: number;
  /** Null until rated — never zero, which reads as "bad" rather than "new". */
  averageRating: number | null;
  /** Metres, measured by PostGIS. Null when the search had no origin. */
  distanceM: number | null;
  /** Cheapest matching service in XAF. Null means "ask", which is honest. */
  priceFrom: number | null;
  matchedServiceName: string | null;
  matchedServiceCount: number;
  latitude: number | null;
  longitude: number | null;
  /** A few portfolio images for the preview strip — the top hiring driver. */
  portfolioPreview: string[];
  /** True for a paid placement — always a genuine match, never a page takeover. */
  sponsored: boolean;
}

/**
 * Projects a search hit onto the card contract.
 *
 * `portfolioPreview` is empty because the search read does not carry portfolio
 * media — deliberately, on the API side: joining every worker's photos into a
 * paged result set is a per-row cost paid by a list most people scroll past. The
 * card renders no strip rather than grey placeholders, and the full evidence is
 * one tap away on the profile.
 */
export function searchResultToCard(worker: SearchWorkerResult): WorkerCardData {
  return {
    workerProfileId: worker.workerProfileId,
    userId: worker.userId,
    name: worker.name,
    avatar: worker.avatar,
    headline: worker.headline,
    city: worker.city,
    area: worker.area,
    tier: worker.tier,
    trustScore: worker.trustScore,
    completedJobs: worker.completedJobs,
    averageRating: worker.averageRating,
    distanceM: worker.distanceM,
    priceFrom: worker.priceFrom,
    matchedServiceName: worker.matchedServiceName,
    matchedServiceCount: worker.matchedServiceCount,
    latitude: worker.latitude,
    longitude: worker.longitude,
    portfolioPreview: [],
    sponsored: worker.sponsored,
  };
}

/**
 * Projects a proximity hit onto the same card contract.
 *
 * Price is null here because a proximity read has no query to match a service
 * against, and the cheapest thing somebody does is not the price of the thing
 * you want. The card shows "on request" rather than a number that would be
 * wrong for most jobs.
 */
export function nearbyResultToCard(worker: NearbyWorkerResult): WorkerCardData {
  return {
    workerProfileId: worker.workerProfileId,
    userId: worker.userId,
    name: worker.name,
    avatar: worker.avatar,
    headline: worker.headline,
    city: worker.city,
    area: worker.area,
    tier: worker.tier,
    trustScore: worker.trustScore,
    completedJobs: worker.completedJobs,
    averageRating: worker.averageRating,
    distanceM: worker.distanceM,
    priceFrom: null,
    matchedServiceName: null,
    matchedServiceCount: 0,
    latitude: worker.latitude,
    longitude: worker.longitude,
    portfolioPreview: [],
    // Proximity reads carry no sponsorship signal — only a search hit does.
    sponsored: false,
  };
}

/**
 * Projects a saved worker onto the same card contract, for the Saved list.
 *
 * `myFavorites` carries no distance, price or matched-service fields — those
 * belong to a search hit, not a bookmark — so they are null/empty here. The
 * card already renders each of those as optional.
 */
export function savedWorkerToCard(worker: SavedWorker): WorkerCardData {
  return {
    workerProfileId: worker.userId,
    userId: worker.userId,
    name: worker.name,
    avatar: worker.avatar,
    headline: worker.headline,
    city: worker.city,
    area: null,
    tier: worker.tier,
    trustScore: worker.trustScore,
    completedJobs: worker.completedJobs,
    averageRating: worker.averageRating,
    distanceM: null,
    priceFrom: null,
    matchedServiceName: null,
    matchedServiceCount: 0,
    latitude: null,
    longitude: null,
    portfolioPreview: [],
    // A bookmark carries no sponsorship signal — that belongs to a search hit.
    sponsored: false,
  };
}

/**
 * Formats an XAF amount.
 *
 * XAF has no minor unit, so there are never decimals — a "5 000,00 FCFA" price
 * tag is simply wrong here, not merely unidiomatic. Intl is given the locale so
 * French gets its non-breaking space grouping and English does not.
 */
export function formatXaf(amount: number | null | undefined, locale: string): string | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;

  return new Intl.NumberFormat(locale === 'fr' ? 'fr-CM' : 'en-CM', {
    style: 'currency',
    currency: 'XAF',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(amount));
}

/**
 * Formats a worker's median invitation-response time as a concrete, checkable
 * claim ("responds within 2 hours") rather than vague marketing copy — the
 * bucket is a rounded-up upper bound of the real median, never the raw minute
 * count, so the claim stays true on the individual reply that took longer.
 */
export function formatResponseTime(
  minutes: number | null | undefined,
  t: (
    key: 'withinHour' | 'withinHours' | 'withinDay' | 'withinDays' | 'aboutAWeek',
    values?: { value: string },
  ) => string,
): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return null;

  if (minutes <= 60) return t('withinHour');
  if (minutes < 24 * 60) return t('withinHours', { value: String(Math.ceil(minutes / 60)) });

  if (minutes < 7 * 24 * 60) {
    const days = Math.ceil(minutes / (24 * 60));
    return days === 1 ? t('withinDay') : t('withinDays', { value: String(days) });
  }

  return t('aboutAWeek');
}

/** One decimal, in the viewer's locale — "4,8" in French, "4.8" in English. */
export function formatRating(rating: number | null | undefined, locale: string): string | null {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return null;
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-CM' : 'en-CM', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rating);
}

/**
 * Initials for the avatar fallback. Two letters at most: three or more turns
 * into a smear at 40px, and many names here have four or five parts.
 */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';

  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';

  const first = parts[0] ?? '';
  const last = parts.length === 1 ? '' : (parts[parts.length - 1] ?? '');

  return `${first.charAt(0)}${last.charAt(0)}`.toLocaleUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved searches, recently viewed (DIS-10)
// ─────────────────────────────────────────────────────────────────────────────

const SAVED_SEARCHES_KEY = 'kavio.saved-searches';
const RECENT_WORKERS_KEY = 'kavio.recent-workers';

/** Caps chosen so the lists stay browsable and the storage entry stays small. */
const MAX_SAVED_SEARCHES = 20;
const MAX_RECENT = 12;

export interface SavedSearch {
  /** The querystring produced by serialiseFilters — the whole search, shareable. */
  querystring: string;
  /** What the user typed, for the list label. */
  label: string;
  savedAt: number;
}

export interface RecentWorker {
  userId: string;
  name: string | null;
  avatar: string | null;
  headline: string | null;
  viewedAt: number;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota. Saving is a convenience, never a
    // correctness requirement, so a failure here is silent by design.
  }
}

export function readSavedSearches(): SavedSearch[] {
  return readJson<SavedSearch[]>(SAVED_SEARCHES_KEY, []).filter(
    (entry): entry is SavedSearch =>
      typeof entry?.querystring === 'string' && typeof entry?.savedAt === 'number',
  );
}

/**
 * Saves a search, keyed by its querystring so re-saving the same search moves it
 * to the top instead of accumulating duplicates that all do the same thing.
 */
export function saveSearch(querystring: string, label: string): SavedSearch[] {
  if (!querystring) return readSavedSearches();

  const entry: SavedSearch = { querystring, label, savedAt: Date.now() };
  const next = [entry, ...readSavedSearches().filter((s) => s.querystring !== querystring)].slice(
    0,
    MAX_SAVED_SEARCHES,
  );

  writeJson(SAVED_SEARCHES_KEY, next);
  return next;
}

export function removeSavedSearch(querystring: string): SavedSearch[] {
  const next = readSavedSearches().filter((entry) => entry.querystring !== querystring);
  writeJson(SAVED_SEARCHES_KEY, next);
  return next;
}

/**
 * Snapshot cache for `readRecentWorkers`.
 *
 * Same reason as the location store: this backs a `useSyncExternalStore`
 * snapshot, which compares by identity and would re-render forever if handed a
 * fresh array on every call.
 */
const EMPTY_RECENT: RecentWorker[] = [];
let cachedRecentRaw: string | null = null;
let cachedRecent: RecentWorker[] = EMPTY_RECENT;

export function readRecentWorkers(): RecentWorker[] {
  if (typeof window === 'undefined') return EMPTY_RECENT;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(RECENT_WORKERS_KEY);
  } catch {
    return EMPTY_RECENT;
  }

  if (raw === cachedRecentRaw) return cachedRecent;
  cachedRecentRaw = raw;

  cachedRecent = readJson<RecentWorker[]>(RECENT_WORKERS_KEY, EMPTY_RECENT).filter(
    (entry): entry is RecentWorker => typeof entry?.userId === 'string',
  );

  return cachedRecent;
}

/** Server snapshot for `useSyncExternalStore` — stable, so it never loops. */
export function emptyRecentWorkers(): RecentWorker[] {
  return EMPTY_RECENT;
}

/** Records a profile view, most recent first, deduplicated by identity. */
export function recordRecentWorker(worker: Omit<RecentWorker, 'viewedAt'>): void {
  const entry: RecentWorker = { ...worker, viewedAt: Date.now() };
  const next = [entry, ...readRecentWorkers().filter((w) => w.userId !== worker.userId)].slice(
    0,
    MAX_RECENT,
  );

  writeJson(RECENT_WORKERS_KEY, next);
}
