/**
 * Distance and ETA (PROMPT 74; SOS-03). Pure functions — no PostGIS round-trip on
 * the hot path of a live position stream, which fires every few seconds. The
 * authoritative geometry still persists (LocationPing.location) for any spatial
 * review; this is the cheap live estimate the viewer sees ticking down.
 *
 * The distance is a great-circle (haversine) approximation, which is correct to
 * within a fraction of a percent over the few kilometres a worker travels to a
 * job — far tighter than GPS noise, and it needs no road graph.
 */

const EARTH_RADIUS_M = 6_371_000;

/** Metres between two WGS84 points (haversine). */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Assumed travel speed when the device reports none, in m/s. 25 km/h is a
 * realistic average for a moto or car through Douala/Yaoundé traffic — the mode
 * most workers travel by — and keeps the ETA honest rather than optimistic.
 */
const DEFAULT_SPEED_MPS = 25_000 / 3600;

/** A live speed below this (m/s) is treated as "stopped" and ignored for ETA. */
const MIN_MEANINGFUL_SPEED_MPS = 0.5;

/**
 * Seconds to cover `distanceMeters` at `speedMps` (the device's reported speed
 * when it is moving, else the default). Null when there is no destination to head
 * toward — the caller renders distance only.
 */
export function etaSeconds(distanceMeters: number, speedMps?: number | null): number {
  const speed = speedMps && speedMps >= MIN_MEANINGFUL_SPEED_MPS ? speedMps : DEFAULT_SPEED_MPS;
  return Math.round(distanceMeters / speed);
}

export interface TravelEstimate {
  distanceMeters: number;
  etaSeconds: number;
}

/** Distance + ETA from a live position to a destination, or null with no destination. */
export function estimateTravel(
  fromLat: number,
  fromLng: number,
  destLat: number | null,
  destLng: number | null,
  speedMps?: number | null,
): TravelEstimate | null {
  if (destLat === null || destLng === null) {
    return null;
  }
  const distanceMeters = Math.round(haversineMeters(fromLat, fromLng, destLat, destLng));
  return { distanceMeters, etaSeconds: etaSeconds(distanceMeters, speedMps) };
}
