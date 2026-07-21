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
 */

export type LocationSource = 'DEVICE_GPS' | 'HUMAN_INPUT' | 'REVERSE_GEOCODE';

export interface BrowsingLocation {
  latitude: number;
  longitude: number;
  /** How the coordinate was obtained. HUMAN_INPUT is protected — see mergeLocation. */
  source: LocationSource;
  /** The user's own words: "Carrefour Ndokotti, behind the pharmacy". */
  landmark?: string | null;
  /** Resolved area name for display ("Akwa, Douala"). Never authoritative. */
  label?: string | null;
  /** Search radius in metres, so a shared link carries the area, not just the point. */
  radiusM: number;
  /** Epoch ms. A fix from three days ago should not be presented as "current". */
  setAt: number;
}

// Mirrors apps/api/src/geo/geo.config.ts. Divergence would let the UI offer a
// radius the server silently clamps, which reads as the filter being ignored.
export const MIN_RADIUS_M = 100;
export const MAX_RADIUS_M = 100_000;
export const DEFAULT_RADIUS_M = 10_000;

/** The radii the UI offers. Round numbers people think in, not a free slider. */
export const RADIUS_STEPS_M = [1_000, 3_000, 5_000, 10_000, 25_000, 50_000] as const;

/**
 * Douala, Cameroon's largest city and the first launch market. Used only as a
 * map's opening viewport when we know nothing — never written as a location, and
 * never used as a search origin, because "results near a city you did not
 * choose" is worse than no results.
 */
export const FALLBACK_VIEWPORT = { latitude: 4.0511, longitude: 9.7679, zoom: 11 } as const;

const STORAGE_KEY = 'trustpro.location';

/**
 * A stored fix goes stale after a week. People move, and a month-old GPS point
 * silently driving a "near you" feed is a wrong answer presented confidently.
 * A hand-placed pin is exempt: the user chose it, so it stays until they change
 * it (see readStoredLocation).
 */
const DEVICE_FIX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function clampRadius(radiusM: number | null | undefined): number {
  if (typeof radiusM !== 'number' || !Number.isFinite(radiusM)) return DEFAULT_RADIUS_M;
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(radiusM)));
}

export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    // 0,0 is the Null Island signature of an uninitialised coordinate pair. It
    // is a real place in the Gulf of Guinea and nobody on this platform is
    // there, so treating it as unset is safe and catches a common bug class.
    !(latitude === 0 && longitude === 0)
  );
}

/**
 * Rounds a coordinate to ~11 m before it leaves the device.
 *
 * Six decimals of GPS identifies a doorway. The platform's spatial answers are
 * neighbourhood-scale ("is this plumber in Akwa or Bonabéri"), so the extra
 * precision buys nothing and costs the user a record of exactly where they
 * sleep. Rounding at the boundary makes that non-negotiable rather than a
 * preference each caller re-decides.
 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/**
 * Decides whether an incoming fix may replace the current one.
 *
 * Returns `applied: false` for the one case that matters: an automatic fix
 * arriving over a hand-placed pin. That is a successful, correct outcome — the
 * pin held — so it is reported, never thrown, and the UI turns it into an offer
 * ("update your saved location?") rather than an error.
 */
export function mergeLocation(
  current: BrowsingLocation | null,
  incoming: Omit<BrowsingLocation, 'setAt' | 'radiusM'> & { radiusM?: number },
  options: { overrideHumanPin?: boolean } = {},
): { applied: boolean; location: BrowsingLocation } {
  const next: BrowsingLocation = {
    ...incoming,
    latitude: roundCoordinate(incoming.latitude),
    longitude: roundCoordinate(incoming.longitude),
    radiusM: clampRadius(incoming.radiusM ?? current?.radiusM),
    setAt: Date.now(),
  };

  const humanPinHeld = current?.source === 'HUMAN_INPUT';
  const incomingIsAutomatic = incoming.source !== 'HUMAN_INPUT';

  if (humanPinHeld && incomingIsAutomatic && !options.overrideHumanPin) {
    return { applied: false, location: current };
  }

  return { applied: true, location: next };
}

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

/**
 * Formats a server-measured distance for display.
 *
 * Under a kilometre it rounds to 50 m, because "480 m" implies a precision the
 * stored coordinate does not have. Above it, one decimal to 10 km and whole
 * kilometres beyond — nobody choosing between two electricians cares about the
 * difference between 23.4 km and 23.6 km.
 */
export function formatDistance(
  metres: number | null | undefined,
  t: (key: 'metres' | 'kilometres', values: { value: string }) => string,
): string | null {
  if (typeof metres !== 'number' || !Number.isFinite(metres) || metres < 0) return null;

  if (metres < 1000) {
    const rounded = Math.max(50, Math.round(metres / 50) * 50);
    return t('metres', { value: String(rounded) });
  }

  const km = metres / 1000;
  const value = km < 10 ? km.toFixed(1) : String(Math.round(km));
  return t('kilometres', { value });
}

/** "Akwa, Douala" from the parts a profile carries, skipping the blanks. */
export function formatArea(parts: { area?: string | null; city?: string | null }): string | null {
  const segments = [parts.area, parts.city].filter(
    (segment): segment is string => typeof segment === 'string' && segment.trim().length > 0,
  );
  if (segments.length === 0) return null;

  // "Akwa, Akwa" happens when a quarter and its city share a name.
  const unique = segments.filter((segment, index) => segments.indexOf(segment) === index);
  return unique.join(', ');
}
