'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  getConnectivity,
  INITIAL_CONNECTIVITY,
  subscribeConnectivity,
  type ConnectivityState,
} from './connectivity';
import { flushQueue, hydrateQueue, subscribeToQueue, queueSnapshot } from './write-queue';

/**
 * Connectivity, as the UI sees it (SYS-02, SYS-04).
 *
 * Backed by lib/offline/connectivity.ts, which treats `navigator.onLine` only
 * as a hint and confirms it with a tiny probe of our own origin, so a captive
 * portal or a dead cell tower reads as offline and a flaky "offline" report on a
 * working link does not.
 */

export function useConnectivity(): ConnectivityState {
  return useSyncExternalStore(
    subscribeConnectivity,
    getConnectivity,
    // The server has no connectivity opinion about the client. Assuming ONLINE
    // keeps the offline bar out of the server-rendered HTML, so it can never
    // flash on a perfectly connected first paint.
    () => INITIAL_CONNECTIVITY,
  );
}

export function useIsOnline(): boolean {
  return useConnectivity().status === 'online';
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
    // The probe-confirmed return (connectivity.ts). On a captive portal the
    // browser's `online` fires long before requests can actually get out.
    window.addEventListener('kavio:reconnected', onOnline);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('kavio:reconnected', onOnline);
    };
  }, []);
}
