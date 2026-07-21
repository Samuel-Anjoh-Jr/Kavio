// TrustPro app-shell service worker.
//
// Registered ONLY from components/pwa/service-worker-register.tsx, which is
// mounted only inside app/[locale]/app/layout.tsx. Registration passes an
// explicit `scope: "/{locale}/app/"`, so this worker never controls the
// marketing landing page — that exclusion is enforced by the browser at
// registration time, not by any check in here (PROMPT 18 / CLAUDE.md
// ACCESS MODEL).
//
// Strategy: navigations (HTML documents) are network-first with a cached
// offline fallback; hashed, immutable Next.js build assets are cache-first.
// Everything else (API calls, GraphQL, uploads) passes straight through —
// this worker never caches non-GET requests or cross-origin traffic.

const CACHE_VERSION = 'trustpro-app-shell-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached ?? (await cache.match(OFFLINE_URL));
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
