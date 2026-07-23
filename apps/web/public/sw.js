// TrustPro app-shell service worker.
//
// Registered ONLY from components/pwa/service-worker-register.tsx, which is
// mounted only inside app/[locale]/app/layout.tsx. Registration passes an
// explicit `scope: "/{locale}/app/"`, so this worker never controls the
// marketing landing page — that exclusion is enforced by the browser at
// registration time, not by any check in here (PROMPT 18 / CLAUDE.md
// ACCESS MODEL).
//
// Strategy (SYS-02, NFR-PWA-01):
//
//   * Hashed, immutable Next.js build assets  -> cache-first.
//   * Everything else the app shell renders from (page documents, RSC flight
//     payloads, generated icons) -> STALE-WHILE-REVALIDATE: the cached copy is
//     served immediately and a fresh one is fetched in the background for next
//     time. This is what makes a previously viewed worker profile, job post or
//     discovery screen open instantly, and open at all with no network.
//   * Everything else (GraphQL, REST writes, uploads, cross-origin) passes
//     straight through, uncached.
//
// SWR is chosen over network-first deliberately. Network-first makes every
// navigation wait out a timeout before falling back — on the 3G connections
// TrustPro targets that is the difference between an app that feels broken and
// one that feels instant. The cost is that a document can be one visit stale;
// that is acceptable here because the DATA on these screens does not come from
// the document. Reads go through Apollo (persisted separately to IndexedDB, see
// lib/offline/apollo-persist.ts), so the cached document is a shell, not
// yesterday's prices.
//
// What is NEVER served stale: anything under /api. A cached GraphQL read could
// show a released escrow as still held, and a cached write is nonsense.

const SHELL_CACHE = 'trustpro-shell-v2';
const CONTENT_CACHE = 'trustpro-content-v2';
const OFFLINE_URL = '/offline.html';

/**
 * Ceiling on cached documents/payloads. Browsers evict the whole origin at once
 * under storage pressure, so a worker that grows without limit does not just
 * waste space — it risks taking the offline fallback down with it.
 */
const CONTENT_CACHE_LIMIT = 80;

const CURRENT_CACHES = [SHELL_CACHE, CONTENT_CACHE];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API traffic is never cached — see the header note.
  if (url.pathname.startsWith('/api/')) return;

  // Hashed build output is immutable: if the name matches, the bytes match.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Page documents and the RSC flight payloads that client-side navigation
  // fetches. Both are how a screen the user has already seen comes back.
  if (request.mode === 'navigate' || isFlightRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request, { navigation: request.mode === 'navigate' }));
    return;
  }

  // Generated PWA icons and other same-origin GETs the shell depends on.
  if (url.pathname.includes('/app/icons/') || url.pathname.startsWith('/_next/image')) {
    event.respondWith(staleWhileRevalidate(request, { navigation: false }));
  }
});

/** App Router client navigation asks for the same URL with an RSC marker. */
function isFlightRequest(request, url) {
  return request.headers.get('RSC') === '1' || url.searchParams.has('_rsc');
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/**
 * Serve cached, revalidate behind it.
 *
 * The revalidation promise is deliberately not awaited on the hit path — that
 * is the whole strategy — but its rejection IS caught. An unhandled rejection
 * in a service worker can take the worker down, which would cost the user every
 * offline capability at once over a single failed background fetch.
 */
async function staleWhileRevalidate(request, { navigation }) {
  const cache = await caches.open(CONTENT_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      // Opaque and error responses are not worth keeping: caching a 500 would
      // serve that 500 back for as long as the entry survives.
      if (response.ok && response.type === 'basic') {
        cache.put(request, response.clone()).then(() => trimCache(cache, CONTENT_CACHE_LIMIT));
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const fresh = await network;
  if (fresh) return fresh;

  // Nothing cached and nothing reachable. A navigation gets the branded offline
  // page; a flight payload gets an error, which the client treats as a failed
  // navigation rather than rendering a broken half-page.
  if (navigation) {
    const shell = await caches.open(SHELL_CACHE);
    const offline = await shell.match(OFFLINE_URL);
    if (offline) return offline;
  }

  return Response.error();
}

/** Oldest-first eviction. Cache API preserves insertion order of keys. */
async function trimCache(cache, limit) {
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Web push (NOT-02, PROMPT 77).
//
// The server (WebPushProvider) encrypts a JSON payload of { title, body, url,
// tag } and the browser wakes this worker to show it. The click handler then
// deep-links into the app — focusing an existing tab if the app is already open,
// or opening one at the notification's URL if not. The URL is always an app-
// relative path the API produced (notification-links.ts), never attacker input.
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  // A push with no/garbled data still shows something rather than being silently
  // dropped — a notification the user was promised must not vanish over a parse
  // error.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'TrustPro';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/window.svg',
    badge: payload.badge || '/window.svg',
    // The deep link travels in `data` so the click handler can read it. Defaults
    // to the app home so a click is never a dead end.
    data: { url: payload.url || '/app/home' },
    // Collapse repeats of the same subject (e.g. several messages in one thread)
    // into one notification rather than stacking them.
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || '/app/home';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Prefer focusing an already-open app tab and navigating it, so a click
      // does not pile up duplicate tabs.
      for (const client of clientList) {
        if (client.url.includes('/app') && 'focus' in client) {
          client.postMessage({ type: 'notification-click', url: target });
          return client.focus();
        }
      }
      // Otherwise open a fresh tab at the deep link.
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    }),
  );
});
