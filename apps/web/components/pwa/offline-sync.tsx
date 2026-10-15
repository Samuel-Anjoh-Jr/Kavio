'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useIsOnline } from '@/lib/offline/use-online';
import { claimOfflineData, GUEST_OWNER } from '@/lib/offline/user-data';

/**
 * Keeps the device's offline copy correct for the person using it (SYS-02).
 *
 * 1. OWNERSHIP. Once the session settles, offline data is claimed for that
 *    identity (or "guest"); a different owner than last time wipes it first
 *    (lib/offline/user-data.ts). A session that reads as signed out while the
 *    device is OFFLINE is not trusted for this: it only means the session could
 *    not be checked, and wiping on it would destroy exactly the data the person
 *    went offline to read.
 * 2. WARMING. Only after ownership is settled (so a fresh copy is never wiped by
 *    a claim that lands after it), the service worker is told about this page's
 *    document and build assets, and about each screen reached by client-side
 *    navigation. See the "Warming" section of public/sw.js for why those would
 *    otherwise be missing.
 *
 * Renders nothing. Mounted once, from the app shell.
 */
export function OfflineSync() {
  const { data: session, status } = useSession();
  const isOnline = useIsOnline();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [owner, setOwner] = useState<string | null>(null);

  const userId = session?.user?.id || null;
  const nextOwner =
    status === 'authenticated' && userId
      ? userId
      : status === 'unauthenticated' &&
          isOnline &&
          typeof navigator !== 'undefined' &&
          navigator.onLine
        ? GUEST_OWNER
        : null;

  useEffect(() => {
    if (!nextOwner || nextOwner === owner) return;
    let cancelled = false;
    void claimOfflineData(nextOwner).then(() => {
      if (!cancelled) setOwner(nextOwner);
    });
    return () => {
      cancelled = true;
    };
  }, [nextOwner, owner]);

  // Once ownership settles: every build asset this page loaded before the
  // worker could see it.
  useEffect(() => {
    if (!owner) return;
    void postWarm({ assets: collectStaticAssets() });
  }, [owner]);

  // The boot document, then each later screen. The search string is part of
  // the key: a filtered search results page is a different page.
  const search = searchParams.toString();
  useEffect(() => {
    if (!owner) return;
    void postWarm({ documents: [window.location.href], session: true });
  }, [owner, pathname, search]);

  return null;
}

interface WarmMessage {
  assets?: string[];
  documents?: string[];
  /** Refresh the worker's offline copy of the session (public/sw.js). */
  session?: boolean;
}

async function postWarm(message: WarmMessage) {
  if (!('serviceWorker' in navigator) || !navigator.onLine) return;
  // Respect a data-saver request: warming re-downloads pages the person is
  // already looking at, which is a cost they have asked us not to spend.
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;

  try {
    const worker = await activeWorker();
    worker?.postMessage({ type: 'kavio:warm', ...message });
  } catch {
    // No worker: the app simply has no offline copy, as before.
  }
}

const REGISTRATION_POLL_MS = 1_000;
const REGISTRATION_ATTEMPTS = 10;

/**
 * The activated worker for THIS URL.
 *
 * Not `navigator.serviceWorker.ready`: that is tied to the URL the document was
 * first loaded at, so after signing in on /auth/login (outside the worker's
 * scope) and arriving here by client-side navigation, it never resolves. Asking
 * by the current URL works for both kinds of arrival. Registration happens in a
 * sibling component's effect, so it may not exist yet on the first call.
 */
async function activeWorker(): Promise<ServiceWorker | null> {
  for (let attempt = 0; attempt < REGISTRATION_ATTEMPTS; attempt += 1) {
    const registration = await navigator.serviceWorker.getRegistration(window.location.href);
    const worker = registration?.active ?? registration?.waiting ?? registration?.installing;
    if (worker?.state === 'activated') return worker;
    if (worker) return waitForActivation(worker);
    await new Promise((resolve) => setTimeout(resolve, REGISTRATION_POLL_MS));
  }
  return null;
}

function waitForActivation(worker: ServiceWorker): Promise<ServiceWorker | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), REGISTRATION_POLL_MS * REGISTRATION_ATTEMPTS);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        clearTimeout(timeout);
        resolve(worker);
      } else if (worker.state === 'redundant') {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  });
}

function collectStaticAssets(): string[] {
  const urls = new Set<string>();
  for (const entry of performance.getEntriesByType('resource')) {
    if (entry.name.includes('/_next/static/')) urls.add(entry.name);
  }
  document
    .querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[href]')
    .forEach((element) => {
      const url = 'src' in element && element.src ? element.src : (element as HTMLLinkElement).href;
      if (url && url.includes('/_next/static/')) urls.add(url);
    });
  return [...urls];
}
