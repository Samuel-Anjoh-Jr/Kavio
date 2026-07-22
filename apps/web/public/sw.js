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
