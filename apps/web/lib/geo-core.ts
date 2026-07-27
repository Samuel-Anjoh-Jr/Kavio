/**
 * Pure coordinate helpers with no `window`/`localStorage` dependency (DIS-09).
 *
 * Split out of geo.ts so server code (e.g. lib/search-filters.ts, rendered from
 * a Server Component) can validate/clamp coordinates without pulling in the
 * `'use client'` boundary that the rest of geo.ts needs for localStorage access.
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
