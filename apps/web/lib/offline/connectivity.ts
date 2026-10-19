/**
 * Connectivity detection for the installable app (SYS-02, SYS-04).
 *
 * `navigator.onLine` alone is not trustworthy in either direction for Kavio's
 * users: it says "online" behind a captive portal or on a dead cell tower, and a
 * few VPN/driver combinations report "offline" on a perfectly good link. So the
 * browser signal is only ever a HINT that triggers a probe — one tiny,
 * uncacheable request to our own origin — and the probe's outcome is what the
 * UI believes.
 *
 * The decision logic is a pure reducer (`reduceConnectivity`) so it can be unit
 * tested without a browser; the store below is the thin, impure shell that
 * feeds it browser events and probe results.
 */

export type ConnectivityStatus = 'online' | 'offline';

export interface ConnectivityState {
  status: ConnectivityStatus;
  /**
   * True for a short moment after a CONFIRMED offline -> online transition, so
   * the UI can say "Back online, updating" instead of silently vanishing.
   */
  reconnected: boolean;
}

export type ConnectivityEvent =
  { type: 'probe-failed' } | { type: 'probe-succeeded' } | { type: 'reconnected-dismissed' };

export const INITIAL_CONNECTIVITY: ConnectivityState = { status: 'online', reconnected: false };

/**
 * Pure transition function.
 *
 * Browser `online`/`offline` events deliberately do NOT appear here: they only
 * schedule a probe. Only a probe result can change what the user is told, which
 * is the whole point of confirming.
 */
export function reduceConnectivity(
  state: ConnectivityState,
  event: ConnectivityEvent,
): ConnectivityState {
  switch (event.type) {
    case 'probe-failed':
      // Going offline also cancels a lingering "back online" confirmation: the
      // two messages must never be on screen at once.
      return state.status === 'offline' && !state.reconnected
        ? state
        : { status: 'offline', reconnected: false };

    case 'probe-succeeded':
      if (state.status === 'offline') return { status: 'online', reconnected: true };
      return state;

    case 'reconnected-dismissed':
      return state.reconnected ? { ...state, reconnected: false } : state;

    default:
      return state;
  }
}

/** True when an error is a transport failure rather than an HTTP answer. */
export function isNetworkFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  // A response that arrived, any status, is the server answering.
  if (typeof (error as { status?: unknown }).status === 'number') return false;
  const name = (error as { name?: unknown }).name;
  // `fetch` rejects with a TypeError for DNS/socket/offline failures and an
  // AbortError/TimeoutError when our own timeout gives up on a dead link.
  return name === 'TypeError' || name === 'AbortError' || name === 'TimeoutError';
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser store
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A static file under public/: served without middleware, without auth and
 * without the service worker caching it, so a 2xx means "our origin is
 * reachable" and nothing else. HEAD keeps it to headers only.
 */
const PROBE_URL = '/ping.txt';
const PROBE_TIMEOUT_MS = 5_000;
/** While offline, re-check this often in case no `online` event ever fires. */
const OFFLINE_RECHECK_MS = 20_000;
const RECONNECTED_VISIBLE_MS = 3_000;

type Listener = () => void;

let state: ConnectivityState = INITIAL_CONNECTIVITY;
const listeners = new Set<Listener>();
let started = false;
let probing: Promise<void> | null = null;
let recheckTimer: ReturnType<typeof setInterval> | null = null;
let reconnectedTimer: ReturnType<typeof setTimeout> | null = null;

function dispatch(event: ConnectivityEvent) {
  const next = reduceConnectivity(state, event);
  if (next === state) return;

  const cameBack = next.reconnected && !state.reconnected;
  state = next;

  if (state.status === 'offline') startRecheck();
  else stopRecheck();

  if (reconnectedTimer && !state.reconnected) {
    clearTimeout(reconnectedTimer);
    reconnectedTimer = null;
  }
  if (cameBack) {
    reconnectedTimer = setTimeout(
      () => dispatch({ type: 'reconnected-dismissed' }),
      RECONNECTED_VISIBLE_MS,
    );
    window.dispatchEvent(new CustomEvent('kavio:reconnected'));
  }

  for (const listener of listeners) listener();
}

function startRecheck() {
  if (recheckTimer) return;
  recheckTimer = setInterval(() => void probeConnectivity(), OFFLINE_RECHECK_MS);
}

function stopRecheck() {
  if (!recheckTimer) return;
  clearInterval(recheckTimer);
  recheckTimer = null;
}

/** Runs one probe (deduplicated while in flight) and feeds the result in. */
export function probeConnectivity(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (probing) return probing;

  probing = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(`${PROBE_URL}?t=${Date.now()}`, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      // Only our own file coming back proves the link works. A captive portal
      // answers with its own page or a redirect to another host, which surfaces
      // here as a non-OK status or a rejected fetch.
      dispatch({ type: response.ok ? 'probe-succeeded' : 'probe-failed' });
    } catch {
      dispatch({ type: 'probe-failed' });
    } finally {
      clearTimeout(timeout);
      probing = null;
    }
  })();

  return probing;
}

/**
 * Called by the data layer when a request could not leave the device. It does
 * not flip the state by itself (one failed request on a flaky link is not
 * "offline"); it asks the probe to confirm.
 */
export function reportNetworkFailure(): void {
  if (typeof window === 'undefined') return;
  void probeConnectivity();
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;

  const check = () => void probeConnectivity();
  window.addEventListener('online', check);
  window.addEventListener('offline', check);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.status === 'offline') check();
  });

  // A cold start with the radio off fires no `offline` event, so check once.
  // When the browser already says "online" the boot is not probed: that would
  // spend a request on every launch to confirm what is almost always true, and
  // any real failure is reported by the data layer anyway.
  if (!navigator.onLine) check();
}

export function subscribeConnectivity(listener: Listener): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConnectivity(): ConnectivityState {
  return state;
}

/** For write guards: true only when offline has been CONFIRMED or is certain. */
export function isKnownOffline(): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return state.status === 'offline';
}
