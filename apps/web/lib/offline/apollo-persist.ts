'use client';

import type { InMemoryCache } from '@apollo/client-integration-nextjs';
import { createLogger } from '@/lib/logger';
import { idbGet, idbSet, STORE_APOLLO } from './idb';
import { mergeSnapshots, type NormalizedSnapshot } from './snapshot-merge';

const logger = createLogger('apollo-persist');

/**
 * Persists the Apollo normalized cache to IndexedDB so previously viewed worker
 * profiles, jobs and discovery results read instantly — and read AT ALL when
 * offline (SYS-02, NFR-PWA-01).
 *
 * The Apollo cache is already the read single-source-of-truth (CLAUDE.md DUAL
 * API RULE); this only gives that truth a lifetime longer than the tab. The
 * service worker caches documents and assets, which is a different job: it can
 * serve the page, but not the data the page renders.
 *
 * IndexedDB rather than localStorage: a normalized cache of profiles with
 * portfolio metadata blows past the 5MB localStorage ceiling on a heavy user,
 * and localStorage writes block the main thread — on a low-end phone that is a
 * visible stutter on every query result.
 */

const SNAPSHOT_KEY = 'cache-snapshot';
const WRITE_DEBOUNCE_MS = 1_000;

/**
 * Ceiling on the persisted snapshot. Past this the snapshot is dropped rather
 * than trimmed: there is no safe way to evict "half" a normalized cache — the
 * references between entities are the whole point of it — so a cache that has
 * outgrown the budget is better rebuilt from the network than restored broken.
 */
const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

interface Snapshot {
  version: number;
  savedAt: number;
  data: unknown;
}

/**
 * Bumped whenever cache shape changes (typePolicies, key fields). A snapshot
 * from an older shape is discarded rather than migrated: stale normalization
 * keys produce cache misses that look like data loss to the user.
 */
const SNAPSHOT_VERSION = 1;

/** How long a snapshot may be trusted. Beyond this, stale data is worse than none. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** The stored snapshot if it is still usable; a stale or old-shape one is deleted. */
async function readSnapshot(): Promise<Snapshot | null> {
  const snapshot = await idbGet<Snapshot>(STORE_APOLLO, SNAPSHOT_KEY);
  if (!snapshot) return null;

  if (snapshot.version !== SNAPSHOT_VERSION || Date.now() - snapshot.savedAt > MAX_AGE_MS) {
    await idbSet(STORE_APOLLO, SNAPSHOT_KEY, null);
    return null;
  }
  return snapshot;
}

export async function restoreCache(cache: InMemoryCache): Promise<boolean> {
  const snapshot = await readSnapshot();
  if (!snapshot) return false;

  try {
    cache.restore(snapshot.data as Parameters<InMemoryCache['restore']>[0]);
    return true;
  } catch (error) {
    logger.warn('Discarded an unreadable cache snapshot', { payload: { error: String(error) } });
    return false;
  }
}

/**
 * Mirrors cache writes to IndexedDB, debounced.
 *
 * Apollo exposes no change subscription, so the mutating entry points are
 * wrapped. This is the same approach `apollo3-cache-persist` takes, inlined
 * because that package has not kept pace with Apollo Client v4's typings.
 *
 * Returns a teardown that restores the original methods.
 */
/**
 * The pending debounced write, at module scope so `clearPersistedCache` can
 * cancel it. Otherwise a sign-out within the debounce window would wipe the
 * snapshot and then have the timer write the signed-out person's data straight
 * back.
 */
let pendingWrite: ReturnType<typeof setTimeout> | null = null;

/**
 * The snapshot as it stood when this page load began, laid UNDER every write
 * so reads from earlier page loads survive (see snapshot-merge.ts). `null`
 * until loaded, and reset to empty on sign-out.
 */
let baseSnapshot: Promise<NormalizedSnapshot | null> | null = null;

async function writeSnapshot(cache: InMemoryCache): Promise<void> {
  let live: NormalizedSnapshot;
  try {
    live = cache.extract() as NormalizedSnapshot;
  } catch {
    return;
  }

  const base = baseSnapshot ? await baseSnapshot : null;
  // Over budget with history: drop the history first, keep what is live.
  let serialized = JSON.stringify(mergeSnapshots(base, live));
  if (serialized.length > MAX_SNAPSHOT_BYTES && base) serialized = JSON.stringify(live);

  if (serialized.length > MAX_SNAPSHOT_BYTES) {
    logger.warn('Cache snapshot over budget; not persisted', {
      payload: { bytes: serialized.length, budget: MAX_SNAPSHOT_BYTES },
    });
    return;
  }

  await idbSet(STORE_APOLLO, SNAPSHOT_KEY, {
    version: SNAPSHOT_VERSION,
    savedAt: Date.now(),
    data: JSON.parse(serialized) as unknown,
  } satisfies Snapshot);
}

export function startPersisting(cache: InMemoryCache): () => void {
  baseSnapshot ??= readSnapshot().then((snapshot) =>
    snapshot ? (snapshot.data as NormalizedSnapshot) : null,
  );

  const persist = () => {
    if (pendingWrite) clearTimeout(pendingWrite);
    pendingWrite = setTimeout(() => {
      pendingWrite = null;
      void writeSnapshot(cache);
    }, WRITE_DEBOUNCE_MS);
  };

  const originalWrite = cache.write.bind(cache);
  const originalEvict = cache.evict.bind(cache);
  const originalModify = cache.modify.bind(cache);

  cache.write = ((...args: Parameters<InMemoryCache['write']>) => {
    const result = originalWrite(...args);
    persist();
    return result;
  }) as InMemoryCache['write'];

  cache.evict = ((...args: Parameters<InMemoryCache['evict']>) => {
    const result = originalEvict(...args);
    persist();
    return result;
  }) as InMemoryCache['evict'];

  cache.modify = ((...args: Parameters<InMemoryCache['modify']>) => {
    const result = originalModify(...args);
    persist();
    return result;
  }) as InMemoryCache['modify'];

  return () => {
    if (pendingWrite) clearTimeout(pendingWrite);
    pendingWrite = null;
    cache.write = originalWrite;
    cache.evict = originalEvict;
    cache.modify = originalModify;
  };
}

/** Clears the snapshot. Called on sign-out — one device, one person's data. */
export async function clearPersistedCache(): Promise<void> {
  if (pendingWrite) clearTimeout(pendingWrite);
  pendingWrite = null;
  baseSnapshot = Promise.resolve(null);
  await idbSet(STORE_APOLLO, SNAPSHOT_KEY, null);
}
