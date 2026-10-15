// Kavio app-shell service worker.
//
// Registered ONLY from components/pwa/service-worker-register.tsx, which is
// mounted only inside app/[locale]/app/layout.tsx. Registration passes an
// explicit `scope: "/{locale}/app"`, so this worker never controls the
// marketing landing page (`/{locale}`, `/{locale}/services/...`,
// `/{locale}/legal/...`) — that exclusion is enforced by the browser at
// registration time, not by any check in here (PROMPT 18 / CLAUDE.md ACCESS
// MODEL). The scope has no trailing slash on purpose: the manifest's start_url
// is `/{locale}/app?source=pwa`, which a `/{locale}/app/` scope does not cover,
// so the installed app could never launch offline.
//
// OFFLINE MODEL (SYS-02, NFR-PWA-01). After one online session, the app must
// open from the home screen with no network — even after a reboot — show the
// screens the person last saw, and keep them signed in.
//
//   * Hashed `/_next/static/*` build output    -> cache-first (immutable).
//   * Page documents (navigations)              -> NETWORK-FIRST with a short
//     timeout, falling back to the last copy, then to /offline.html. Fresh
//     beats instant here: these documents are server-rendered for the
//     signed-in person (dashboards, jobs, messages), so a stale-first strategy
//     would routinely show yesterday's state while online.
//   * Images                                    -> stale-while-revalidate,
//     capped at IMAGE_CACHE_LIMIT entries.
//   * GET /api/auth/session                     -> network-first, falling back
//     to the last good answer with the access token stripped. next-auth's
//     client turns a failed session fetch into "signed out", so without this
//     an offline launch would log the person out of the UI.
//   * RSC flight payloads, GraphQL, REST, other /api traffic -> network only.
//     A failed flight fetch makes Next fall back to a full navigation, which
//     lands in the document cache above; data comes from Apollo's own
//     IndexedDB snapshot (lib/offline/apollo-persist.ts), never from here.
//
// PRIVACY. Documents and the session copy are personal. They live in their own
// caches (`kavio-pages-*`, `kavio-session-*`) which the page deletes on sign-out
// and whenever a different person signs in on this device
// (lib/offline/user-data.ts). Static assets and images are shared.

// Bump on any change to caching behaviour: activation deletes every `kavio-*`
// cache that is not current, so a new version never reads an old layout.
const VERSION = 'v3';
const STATIC_CACHE = `kavio-static-${VERSION}`;
const PAGES_CACHE = `kavio-pages-${VERSION}`;
const SESSION_CACHE = `kavio-session-${VERSION}`;
const IMAGES_CACHE = `kavio-images-${VERSION}`;
const CURRENT_CACHES = [STATIC_CACHE, PAGES_CACHE, SESSION_CACHE, IMAGES_CACHE];

const OFFLINE_URL = '/offline.html';
const SESSION_PATH = '/api/auth/session';

/**
 * How long a navigation waits for the network before showing the cached copy.
 * Only applies when a cached copy exists; the network response still lands in
 * the cache for next time. Long enough for a slow 3G page, short enough that a
 * dead connection does not feel like a hang.
 */
const NAVIGATION_TIMEOUT_MS = 4000;

/**
 * Ceilings. Browsers evict a whole origin at once under storage pressure, so a
 * cache that grows without limit does not just waste space, it risks taking
 * the offline fallback down with it.
 */
const PAGES_CACHE_LIMIT = 40;
const IMAGE_CACHE_LIMIT = 60;
const STATIC_CACHE_LIMIT = 400;

/** A document warmed this recently is not fetched again (see 'message'). */
const WARM_INTERVAL_MS = 60 * 1000;
const lastWarmed = new Map();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
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
          keys
            .filter((key) => key.startsWith('kavio-') && !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key)),
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

  if (url.pathname === SESSION_PATH) {
    event.respondWith(sessionNetworkFirst(event));
    return;
  }

  // Every other API call is live or nothing — see the header note.
  if (url.pathname.startsWith('/api/')) return;

  // Hashed build output is immutable: if the name matches, the bytes match.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(event));
    return;
  }

  // Flight payloads go straight to the network (see the header note).
  if (isFlightRequest(request, url)) return;

  if (
    request.destination === 'image' ||
    url.pathname.startsWith('/_next/image') ||
    url.pathname.includes('/app/icons/')
  ) {
    event.respondWith(staleWhileRevalidate(event, IMAGES_CACHE, IMAGE_CACHE_LIMIT));
  }
});

/** App Router client navigation asks for the same URL with an RSC marker. */
function isFlightRequest(request, url) {
  return request.headers.get('RSC') === '1' || url.searchParams.has('_rsc');
}

/** A full HTML page from our origin that is safe to replay later. */
function isCacheableDocument(response) {
  return (
    response.ok &&
    response.type === 'basic' &&
    !response.redirected &&
    (response.headers.get('content-type') || '').includes('text/html')
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    cache
      .put(request, response.clone())
      .then(() => trimCache(cache, STATIC_CACHE_LIMIT))
      .catch(() => undefined);
  }
  return response;
}

/**
 * Network-first for page documents.
 *
 * With a cached copy in hand, the network gets NAVIGATION_TIMEOUT_MS before
 * the copy is served; the network response is still awaited in the background
 * (waitUntil) so it refreshes the cache. With no copy, the network gets as long
 * as it needs, because there is nothing better to show.
 */
async function navigationNetworkFirst(event) {
  const { request } = event;
  const cache = await caches.open(PAGES_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });

  const network = fetch(request)
    .then(async (response) => {
      if (isCacheableDocument(response)) {
        await cache.put(request, response.clone());
        lastWarmed.set(stripHash(request.url), Date.now());
        await trimCache(cache, PAGES_CACHE_LIMIT);
      }
      return response;
    })
    .catch(() => null);

  event.waitUntil(network);

  if (cached) {
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS),
    );
    const fresh = await Promise.race([network, timeout]);
    return fresh || cached;
  }

  const fresh = await network;
  if (fresh) return fresh;

  return offlineNavigationFallback(request);
}

/**
 * No network and no copy of this exact URL.
 *
 * The app root (`/{locale}/app`, the installed app's start_url) is only ever a
 * server redirect to the role home or the guest explore screen, and a redirect
 * cannot be cached. So offline it is redirected here to whichever of those two
 * this device has, which is what the server would have done.
 */
async function offlineNavigationFallback(request) {
  const url = new URL(request.url);
  const root = /^\/([a-z]{2})\/app\/?$/.exec(url.pathname);

  if (root) {
    const cache = await caches.open(PAGES_CACHE);
    for (const target of [`/${root[1]}/app/home`, `/${root[1]}/app/explore`]) {
      const hit = await cache.match(new URL(target, url.origin).href, { ignoreVary: true });
      if (hit) return Response.redirect(target, 302);
    }
  }

  const shell = await caches.open(STATIC_CACHE);
  const offline = await shell.match(OFFLINE_URL);
  return offline || Response.error();
}

/**
 * Serve cached, revalidate behind it.
 *
 * The revalidation promise is deliberately not awaited on the hit path — that
 * is the whole strategy — but its rejection IS caught. An unhandled rejection
 * in a service worker can take the worker down, which would cost the user every
 * offline capability at once over a single failed background fetch.
 */
async function staleWhileRevalidate(event, cacheName, limit) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(async (response) => {
      // Opaque and error responses are not worth keeping: caching a 500 would
      // serve that 500 back for as long as the entry survives.
      if (response.ok && response.type === 'basic') {
        await cache.put(request, response.clone());
        await trimCache(cache, limit);
      }
      return response;
    })
    .catch(() => null);

  event.waitUntil(network);

  if (cached) return cached;

  const fresh = await network;
  return fresh || Response.error();
}

/**
 * The session endpoint, kept answerable offline.
 *
 * Online, the live answer is returned untouched and a copy is stored WITHOUT
 * the access token: a bearer token has no use offline and has no business
 * sitting in Cache Storage. A genuinely signed-out answer (`null`) is stored
 * too, so going offline after signing out never resurrects the old session.
 * Offline, the stored copy keeps the UI signed in; nothing can be done with it
 * except read pages and data already on the device.
 */
async function sessionNetworkFirst(event) {
  const { request } = event;
  const cache = await caches.open(SESSION_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      event.waitUntil(storeSession(cache, request, response.clone()));
    }
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreVary: true });
    return cached || Response.error();
  }
}

async function storeSession(cache, request, response) {
  try {
    const body = await response.json();
    if (body && typeof body === 'object') {
      delete body.accessToken;
      delete body.error;
    }
    await cache.put(
      request,
      new Response(JSON.stringify(body ?? null), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }),
    );
  } catch {
    // Not JSON (a proxy error page): keep the previous good copy.
  }
}

/** Oldest-first eviction. Cache API preserves insertion order of keys. */
async function trimCache(cache, limit) {
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

function stripHash(href) {
  const url = new URL(href);
  url.hash = '';
  return url.href;
}

// ─────────────────────────────────────────────────────────────────────────────
// Warming (sent by components/pwa/service-worker-register.tsx).
//
// Two things never pass through this worker on their own:
//   1. The very first page load: it happens before the worker is installed,
//      so neither the document nor its JS/CSS chunks are cached, and an
//      offline relaunch would find nothing to boot.
//   2. Client-side navigations: the App Router fetches RSC payloads, not
//      documents, so a screen reached by tapping a link has no document copy.
// The page reports both (plus a request to refresh the session copy), and this
// fetches them once with the person's own cookies. Only same-origin URLs within reach are accepted.
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'kavio:warm') return;

  const assets = Array.isArray(data.assets) ? data.assets : [];
  const documents = Array.isArray(data.documents) ? data.documents : [];

  event.waitUntil(
    Promise.all([
      warmAssets(assets),
      warmDocuments(documents),
      data.session ? warmSession() : null,
    ]),
  );
});

/**
 * A page reached by client-side navigation from outside the scope (sign-in
 * happens on /auth/login) is not controlled by this worker, so its session
 * reads never pass through `sessionNetworkFirst`. Without this, a person who
 * signed in and then only ever navigated client-side would have no offline
 * session copy, and the first offline launch would show them signed out.
 */
let sessionWarmedAt = 0;
async function warmSession() {
  if (Date.now() - sessionWarmedAt < WARM_INTERVAL_MS) return;
  sessionWarmedAt = Date.now();
  try {
    const request = new Request(SESSION_PATH, { credentials: 'same-origin' });
    const response = await fetch(request);
    if (response.ok) await storeSession(await caches.open(SESSION_CACHE), request, response);
  } catch {
    sessionWarmedAt = 0;
  }
}

function sameOriginUrl(value) {
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? url : null;
  } catch {
    return null;
  }
}

async function warmAssets(list) {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    list.slice(0, 200).map(async (value) => {
      const url = sameOriginUrl(value);
      if (!url || !url.pathname.startsWith('/_next/static/')) return;
      if (await cache.match(url.href)) return;
      try {
        const response = await fetch(url.href, { credentials: 'same-origin' });
        if (response.ok && response.type === 'basic') await cache.put(url.href, response);
      } catch {
        // Offline again already; the next session will warm it.
      }
    }),
  );
  await trimCache(cache, STATIC_CACHE_LIMIT);
}

async function warmDocuments(list) {
  const cache = await caches.open(PAGES_CACHE);
  const scope = new URL(self.registration.scope);

  for (const value of list.slice(0, 5)) {
    const url = sameOriginUrl(value);
    if (!url || !url.pathname.startsWith(scope.pathname)) continue;
    url.hash = '';

    // Recently fetched AND still cached: skip. The cache check matters because
    // the page may have just wiped personal caches (sign-in as someone else),
    // and this worker's memory of having warmed a URL survives that wipe.
    const last = lastWarmed.get(url.href) || 0;
    if (
      Date.now() - last < WARM_INTERVAL_MS &&
      (await cache.match(url.href, { ignoreVary: true }))
    ) {
      continue;
    }
    lastWarmed.set(url.href, Date.now());

    try {
      const response = await fetch(url.href, {
        credentials: 'same-origin',
        headers: { Accept: 'text/html' },
      });
      if (isCacheableDocument(response)) await cache.put(url.href, response);
    } catch {
      lastWarmed.delete(url.href);
    }
  }
  await trimCache(cache, PAGES_CACHE_LIMIT);
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

  const title = payload.title || 'Kavio';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/window.svg',
    badge: payload.badge || '/window.svg',
    // The deep link and the role it's about travel in `data` so the click
    // handler can read them. Defaults to the app home so a click is never a
    // dead end.
    data: { url: payload.url || '/app/home', relevantRole: payload.relevantRole || null },
    // Collapse repeats of the same subject (e.g. several messages in one thread)
    // into one notification rather than stacking them.
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Relay the raw payload to any open tab — that's the ONLY place a custom
      // sound can actually play (no browser lets a site pick the OS push
      // sound), and it also lets an open Notification Center refresh its
      // badge the instant this arrives rather than waiting for the next poll.
      relayToOpenClients(payload),
    ]),
  );
});

async function relayToOpenClients(payload) {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    client.postMessage({ type: 'notification-push', payload });
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const target = data.url || '/app/home';
  const relevantRole = data.relevantRole || null;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Prefer focusing an already-open app tab and navigating it, so a click
      // does not pile up duplicate tabs.
      for (const client of clientList) {
        if (client.url.includes('/app') && 'focus' in client) {
          client.postMessage({ type: 'notification-click', url: target, relevantRole });
          return client.focus();
        }
      }
      // Otherwise open a fresh tab at the deep link. Role-switching only
      // applies to an already-open session; a fresh tab's own load picks up
      // whatever role is already active server-side.
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    }),
  );
});
