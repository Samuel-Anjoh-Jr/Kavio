'use client';

import { fetchJson } from '@/lib/api-error';
import { restDelete, restPost } from '@/lib/rest-api';

/**
 * Web push registration (NOT-02, PROMPT 77).
 *
 * The value-before-prompt rule (SRS §9.2): the browser's permission dialog is
 * only ever raised from a user gesture that has already explained what push is
 * for. Nothing here calls `Notification.requestPermission()` on load — the
 * Notification Center's opt-in control does, after the copy.
 *
 * The subscription is posted to the same API the dispatcher fans out to (P76),
 * so a device that opts in here starts receiving the same events email already
 * carries, with zero change at any dispatch site.
 */

export type PushSupport = 'supported' | 'unsupported';
export type PushPermission = 'granted' | 'denied' | 'default';

/** Whether this browser can do web push at all (Service Worker + Push API). */
export function pushSupport(): PushSupport {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported';
  }
  return 'supported';
}

export function pushPermission(): PushPermission {
  if (typeof Notification === 'undefined') return 'default';
  return Notification.permission as PushPermission;
}

/** The server's VAPID public key, needed to subscribe. Null if push is unconfigured. */
async function fetchVapidPublicKey(): Promise<string | null> {
  const result = await fetchJson<{ publicKey: string | null }>(
    '/api/rest/notifications/vapid-public-key',
    { method: 'GET' },
  );
  return result.publicKey;
}

/**
 * Requests permission (from a user gesture) and registers a subscription.
 *
 * Returns a discriminated result rather than throwing on the expected outcomes
 * (denied, unsupported, unconfigured), because those are states the UI renders,
 * not errors it logs. A genuine failure still rejects.
 */
export async function enableWebPush(
  deviceName?: string,
): Promise<{ ok: true } | { ok: false; reason: 'unsupported' | 'denied' | 'unconfigured' }> {
  if (pushSupport() === 'unsupported') {
    return { ok: false, reason: 'unsupported' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied' };
  }

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) {
    // Push is not configured on this deployment (no VAPID keys). Not an error the
    // user caused, so it is surfaced as a state rather than thrown.
    return { ok: false, reason: 'unconfigured' };
  }

  const registration = await navigator.serviceWorker.ready;

  // Reuse an existing subscription rather than minting a duplicate — the endpoint
  // is the identity, and re-subscribing on the same browser must upsert, not pile
  // up dead rows (the API enforces the same via a unique endpoint).
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // BufferSource cast: the Uint8Array is a valid applicationServerKey, but
      // the lib.dom typing wants an ArrayBuffer-backed view specifically.
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  const json = subscription.toJSON();

  await restPost('notifications/devices', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    ...(deviceName ? { deviceName } : {}),
  });

  return { ok: true };
}

/** Tears down the local subscription and deregisters it server-side. */
export async function disableWebPush(): Promise<void> {
  if (pushSupport() === 'unsupported') return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.toJSON().endpoint;
  await subscription.unsubscribe();

  if (endpoint) {
    // Best-effort: the row is also deactivated on the next failed push, so a
    // network blip here is self-healing rather than leaving a live subscription.
    await restDelete('notifications/devices', { endpoint }).catch(() => undefined);
  }
}

/** Whether this browser currently holds a live push subscription. */
export async function hasActivePushSubscription(): Promise<boolean> {
  if (pushSupport() === 'unsupported') return false;
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) !== null;
}

/**
 * VAPID keys are base64url; `applicationServerKey` needs a Uint8Array. This is the
 * standard conversion, kept local so the push flow has no dependency to justify.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}
