'use client';

/**
 * The browsing location (DIS-09) — the client-side half of the location model
 * described in CLAUDE.md §SPATIAL.
 *
 * Two rules shape everything here.
 *
 * 1. A HUMAN PIN ALWAYS WINS. A device fix is a guess; a pin somebody dropped is
 *    a statement. Once a user has placed one, an automatic fix never silently
 *    replaces it — `mergeLocation` refuses and the UI offers the swap instead.
 *    The API enforces the identical rule server-side (LocationService), so the
 *    guarantee holds whether or not the client behaves.
 *
 * 2. THE CLIENT NEVER MEASURES. Distances arrive from PostGIS in metres and are
 *    only ever FORMATTED here. There is no haversine in this file on purpose:
 *    the moment one exists, a screen starts sorting by it and the authoritative
 *    spatial answer quietly moves into the browser.
 *
 * The pure helpers (validation, clamping, formatting) live in geo-core.ts, which
 * has no `window`/localStorage dependency and is safe to import from server
 * code (e.g. lib/search-filters.ts, parsed inside a Server Component). This file
 * re-exports them so existing client-side imports keep working unchanged.
 */

export {
  type LocationSource,
  type BrowsingLocation,
  MIN_RADIUS_M,
  MAX_RADIUS_M,
  DEFAULT_RADIUS_M,
  RADIUS_STEPS_M,
  FALLBACK_VIEWPORT,
  clampRadius,
  isValidCoordinate,
  roundCoordinate,
  formatDistance,
  formatArea,
  mergeLocation,
} from './geo-core';

import type { BrowsingLocation } from './geo-core';
import { clampRadius, isValidCoordinate } from './geo-core';

const STORAGE_KEY = 'trustpro.location';

/**
 * A stored fix goes stale after a week. People move, and a month-old GPS point
 * silently driving a "near you" feed is a wrong answer presented confidently.
 * A hand-placed pin is exempt: the user chose it, so it stays until they change
 * it (see readStoredLocation).
 */
const DEVICE_FIX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The last value `readStoredLocation` parsed, keyed by the raw JSON it came
 * from.
 *
 * This exists so the reader can back a `useSyncExternalStore` snapshot: that
 * hook compares snapshots by identity and re-renders forever if handed a fresh
 * object each call. Caching on the raw string means a new object is only
 * created when the stored value actually changed.
 */
let cachedRaw: string | null = null;
let cachedLocation: BrowsingLocation | null = null;

export function readStoredLocation(): BrowsingLocation | null {
  if (typeof window === 'undefined') return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing. The session still works; only the memory of it is lost.
    return null;
  }

  if (raw === cachedRaw) return cachedLocation;
  cachedRaw = raw;

  if (!raw) {
    cachedLocation = null;
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BrowsingLocation>;

    if (
      !isValidCoordinate(parsed.latitude, parsed.longitude) ||
      (parsed.source !== 'DEVICE_GPS' &&
        parsed.source !== 'HUMAN_INPUT' &&
        parsed.source !== 'REVERSE_GEOCODE')
    ) {
      cachedLocation = null;
      return null;
    }

    const setAt = typeof parsed.setAt === 'number' ? parsed.setAt : 0;
    if (parsed.source !== 'HUMAN_INPUT' && Date.now() - setAt > DEVICE_FIX_TTL_MS) {
      clearStoredLocation();
      return null;
    }

    cachedLocation = {
      latitude: parsed.latitude as number,
      longitude: parsed.longitude as number,
      source: parsed.source,
      landmark: typeof parsed.landmark === 'string' ? parsed.landmark : null,
      label: typeof parsed.label === 'string' ? parsed.label : null,
      radiusM: clampRadius(parsed.radiusM),
      setAt,
    };
    return cachedLocation;
  } catch {
    clearStoredLocation();
    return null;
  }
}

/**
 * Subscribers to the stored location, so React can treat localStorage as the
 * external store it actually is (`useSyncExternalStore`) rather than mirroring
 * it into component state from an effect.
 *
 * The `storage` event is included, which gets cross-tab sync for free: setting a
 * location in one tab updates the feed in another, instead of the two disagreeing
 * until a reload.
 */
const listeners = new Set<() => void>();

function emitLocationChange(): void {
  for (const listener of listeners) listener();
}

export function subscribeToStoredLocation(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) listener();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

export function writeStoredLocation(location: BrowsingLocation): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
  } catch {
    // Quota or private mode — the location still drives this page view.
  }
  emitLocationChange();
}

export function clearStoredLocation(): void {
  cachedRaw = null;
  cachedLocation = null;

  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
  emitLocationChange();
}
