/**
 * Merging Apollo cache snapshots across page loads (pure, SYS-02).
 *
 * Each full page load starts a fresh in-memory Apollo cache. If the persisted
 * snapshot were simply overwritten with that fresh cache, everything read in
 * EARLIER loads (a job board visited before a reload, say) would vanish from
 * the device, and an offline launch could only show what the very last page
 * load happened to fetch. So the new snapshot is the previous one with the
 * live cache laid over it:
 *
 *   - every normalized entity present in the live cache replaces its old copy
 *     wholesale (live data always wins; no field-level mixing of two versions
 *     of the same record);
 *   - ROOT_QUERY is merged field by field, so `jobs(...)` from an earlier load
 *     survives beside `me` from this one, and any root field the live cache
 *     has replaces the old one.
 *
 * The merged result only ever goes to IndexedDB for offline use. It is never
 * restored into a live, online cache, so it cannot make an online screen stale.
 */

export type NormalizedSnapshot = Record<string, unknown>;

const ROOT_QUERY = 'ROOT_QUERY';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function mergeSnapshots(
  previous: NormalizedSnapshot | null | undefined,
  live: NormalizedSnapshot,
): NormalizedSnapshot {
  if (!previous) return live;

  const merged: NormalizedSnapshot = { ...previous, ...live };

  const previousRoot = previous[ROOT_QUERY];
  const liveRoot = live[ROOT_QUERY];
  if (isRecord(previousRoot) || isRecord(liveRoot)) {
    merged[ROOT_QUERY] = {
      ...(isRecord(previousRoot) ? previousRoot : {}),
      ...(isRecord(liveRoot) ? liveRoot : {}),
    };
  }

  return merged;
}
