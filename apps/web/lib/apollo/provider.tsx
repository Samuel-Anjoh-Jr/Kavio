'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { HttpLink } from '@apollo/client';
import { useApolloClient } from '@apollo/client/react';
import {
  ApolloClient,
  ApolloNextAppProvider,
  type InMemoryCache,
} from '@apollo/client-integration-nextjs';
import { createCache } from './cache';
import { restoreCache, startPersisting } from '@/lib/offline/apollo-persist';
import { isNetworkFailure, reportNetworkFailure } from '@/lib/offline/connectivity';

/**
 * Apollo for CLIENT COMPONENTS. Points at the same-origin /api/graphql proxy,
 * which attaches the bearer token from the session cookie server-side — so the
 * browser never holds an API access token in JavaScript.
 */

/**
 * The browser's cache instance, held at module scope so the offline gate below
 * can reach the very object `makeClient` handed to Apollo. There is exactly one
 * per document, which is also what makes persisting it meaningful.
 */
let browserCache: InMemoryCache | null = null;

/**
 * `fetch` for the GraphQL link that tells the connectivity layer when a read
 * could not leave the device, so a captive portal or dead tower that the
 * browser still calls "online" is caught by the probe (connectivity.ts).
 */
const reportingFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (isNetworkFailure(error)) reportNetworkFailure();
    throw error;
  }
};

function makeClient() {
  const cache = createCache();

  if (typeof window !== 'undefined') {
    browserCache = cache;
    // Start mirroring to IndexedDB immediately — before any query resolves, so
    // the first result of a session is already persisted for the next one.
    startPersisting(cache);
  }

  return new ApolloClient({
    cache,
    link: new HttpLink({
      uri: '/api/graphql',
      fetch: reportingFetch,
      // Sends the Auth.js session cookie, which is what the proxy reads.
      credentials: 'same-origin',
    }),
  });
}

/**
 * Rehydrates the persisted cache when — and ONLY when — the app boots with no
 * network (SYS-02, NFR-PWA-01).
 *
 * Restoring is a whole-cache replacement, so doing it on a healthy boot would
 * race live queries and could overwrite fresher data with last week's. Online,
 * the network is authoritative and persistence simply keeps writing snapshots
 * for the next cold start. Offline, there is nothing to race and the snapshot is
 * the only data that exists — so children are held back for the one IndexedDB
 * read rather than rendering a wall of empty states over a cache that was about
 * to arrive.
 */
function OfflineCacheGate({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );

  useEffect(() => {
    if (!blocked) return;

    let cancelled = false;
    const unblock = () => {
      if (!cancelled) setBlocked(false);
    };

    const cache = browserCache;
    // Either the async restore or — when there is no cache to restore — a
    // microtask resolves the gate. Both go through a promise callback rather
    // than a synchronous setState in the effect body, which would force a
    // cascading render every mount.
    if (cache) {
      void restoreCache(cache).finally(unblock);
    } else {
      void Promise.resolve().then(unblock);
    }

    return () => {
      cancelled = true;
    };
  }, [blocked]);

  // Deliberately renders nothing rather than a skeleton: this lasts one
  // IndexedDB read, and a skeleton that flashes for 20ms is noise, not feedback.
  return blocked ? null : <>{children}</>;
}

/**
 * When the connection is confirmed back (connectivity.ts), re-runs the queries
 * on screen so data restored from the offline snapshot is replaced by live data
 * without the user having to pull to refresh.
 */
function RefetchOnReconnect() {
  const client = useApolloClient();

  useEffect(() => {
    const onReconnected = () => {
      void client.refetchQueries({ include: 'active' }).catch(() => undefined);
    };
    window.addEventListener('kavio:reconnected', onReconnected);
    return () => window.removeEventListener('kavio:reconnected', onReconnected);
  }, [client]);

  return null;
}

export function ApolloProvider({ children }: { children: ReactNode }) {
  return (
    <ApolloNextAppProvider makeClient={makeClient}>
      <RefetchOnReconnect />
      <OfflineCacheGate>{children}</OfflineCacheGate>
    </ApolloNextAppProvider>
  );
}
