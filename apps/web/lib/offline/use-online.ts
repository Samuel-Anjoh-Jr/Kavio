'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { flushQueue, hydrateQueue, subscribeToQueue, queueSnapshot } from './write-queue';

/**
 * Connectivity, as the UI sees it (SYS-02, SYS-04).
 *
 * `navigator.onLine` is famously optimistic — it reports "online" for a device
 * attached to a captive portal or a dead cell tower. It is still the right
 * signal here: it is the only one available without spending the user's data on
 * heartbeat requests, and TrustPro's response to being offline is to show a
 * banner and queue writes, both of which are cheap to be wrong about. A failed
 * write also queues on its own, so a false "online" degrades gracefully.
 */

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    // The server has no connectivity opinion about the client. Assuming ONLINE
    // keeps the offline banner out of the server-rendered HTML, so it can never
    // flash on a perfectly connected first paint.
    () => true,
  );
}

/** How many writes are waiting for the network, for a "pending changes" affordance. */
export function usePendingWriteCount(): number {
  return useSyncExternalStore(
    (callback) => subscribeToQueue(callback),
    () => queueSnapshot().length,
    () => 0,
  );
}

/**
 * Loads the persisted queue and replays it whenever the network returns.
 *
 * Mounted once, from the app shell. It also flushes on mount: the browser fires
 * no `online` event for a connection that came back while the tab was closed,
 * so a queue drained only by the event would sit there until the user happened
 * to lose and regain signal again.
 */
export function useWriteQueueSync(): void {
  useEffect(() => {
    let cancelled = false;

    void hydrateQueue().then(() => {
      if (!cancelled && navigator.onLine) void flushQueue();
    });

    const onOnline = () => void flushQueue();
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, []);
}
