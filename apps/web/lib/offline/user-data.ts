'use client';

import { createLogger } from '@/lib/logger';
import { clearPersistedCache } from './apollo-persist';
import { clearWriteQueue } from './write-queue';

const logger = createLogger('offline-user-data');

/**
 * Per-person offline data, and the one place it is wiped (SYS-02, ACC-05).
 *
 * Three stores hold data that belongs to whoever was signed in:
 *   - the persisted Apollo cache (IndexedDB),
 *   - the offline write queue (IndexedDB),
 *   - the service worker's page and session caches (Cache Storage). Pages in
 *     the app shell are server-rendered for the signed-in identity, so a cached
 *     copy of /app/home IS that person's dashboard.
 *
 * A shared phone is normal for Kavio's users. So everything is tagged with an
 * owner (the identity id, or "guest") and dropped the moment the owner changes:
 * on sign-out, on a session that has really expired, and when a different
 * person signs in on the same device. Hashed static assets and images are not
 * personal and survive.
 */

const OWNER_KEY = 'kavio-offline-owner';

/** Cache Storage buckets holding personal data. Prefixes, so a version bump in sw.js needs no change here. */
const PERSONAL_CACHE_PREFIXES = ['kavio-pages-', 'kavio-session-'];

export const GUEST_OWNER = 'guest';

function readOwner(): string | null {
  try {
    return window.localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(owner: string | null) {
  try {
    if (owner === null) window.localStorage.removeItem(OWNER_KEY);
    else window.localStorage.setItem(OWNER_KEY, owner);
  } catch {
    // Storage disabled: nothing was persisted for anyone either.
  }
}

/**
 * Whether stored offline data must be dropped before `nextOwner` may see it
 * (pure). An unrecorded previous owner counts as a change: data written before
 * ownership was tracked belongs to nobody we can name, so it is not shown to
 * anybody. On a fresh device that costs one no-op clear.
 */
export function ownerChanged(previous: string | null, nextOwner: string): boolean {
  return previous !== nextOwner;
}

export async function clearOfflineUserData(): Promise<void> {
  const tasks: Promise<unknown>[] = [clearPersistedCache(), clearWriteQueue()];

  if (typeof caches !== 'undefined') {
    tasks.push(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => PERSONAL_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
              .map((key) => caches.delete(key)),
          ),
        ),
    );
  }

  const results = await Promise.allSettled(tasks);
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) logger.warn('Some offline data could not be cleared', { payload: { failed } });
}

function describe(owner: string | null): string {
  if (owner === null) return 'unknown';
  return owner === GUEST_OWNER ? 'guest' : 'user';
}

/**
 * Records who the offline data now belongs to, clearing it first if that is a
 * different person. Called whenever the session settles.
 */
export async function claimOfflineData(owner: string): Promise<void> {
  const previous = readOwner();
  if (ownerChanged(previous, owner)) {
    await clearOfflineUserData();
    logger.info('Offline data cleared for a new owner', {
      // Roles only, never ids: the log must not link two people to one device.
      payload: { from: describe(previous), to: describe(owner) },
    });
  }
  writeOwner(owner);
}

/** Sign-out path: wipe, then forget the owner. Never throws, so it cannot block signing out. */
export async function releaseOfflineData(): Promise<void> {
  try {
    await clearOfflineUserData();
  } finally {
    writeOwner(GUEST_OWNER);
  }
}
