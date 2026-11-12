import type { Message } from 'firebase-admin/messaging';
import type { ResolvedAlert } from './alert-profiles';

/**
 * Builds one FCM message per device, shaped for what that device can do.
 *
 *   android, alertsVersion ≥ 2 → DATA-ONLY, high priority. The app's
 *       AlertMessagingService draws the notification itself, so it can loop
 *       the ring, show the call-style banner and countdown, and update a live
 *       order card in place.
 *   android, legacy build      → the old `notification` payload + channel, so
 *       phones that have not updated keep getting notifications exactly as
 *       before (a data-only message would be invisible to them).
 *   ios                        → APNs alert with the brand sound (rings are a
 *       29.5 s render because iOS cannot loop) and time-sensitive interruption.
 *   web                        → DATA-ONLY with Urgency/TTL headers; the
 *       service worker draws it (requireInteraction, vibration, actions) and
 *       relays it to an open tab so the in-app ring sheet can loop the sound.
 */

export const ALERTS_PAYLOAD_VERSION = '2';
export const NATIVE_ALERTS_MIN_VERSION = 2;

export interface DeviceTarget {
  token: string;
  platform: string;
  alertsVersion: number;
}

export interface AlertContent {
  title: string;
  body: string;
  /** Extra line under the body, e.g. "#A1B2C3 · 3 items · 6 500 XAF". */
  subtitle?: string;
  /** Business data from the call site (orderId, deepLink, type…). */
  data: Record<string, string>;
  /** In-app path to open, e.g. /supplier/orders/123. */
  path: string;
  /** Groups/replaces notifications about the same thing. */
  tag: string;
  alertId?: string;
  ackUrl?: string;
  /** When the offer/acceptance window closes (epoch ms), for the countdown. */
  expiresAt?: number;
  actions?: { id: string; title: string }[];
  /** True for escalation re-rings and live updates after the first. */
  isRepeat?: boolean;
  /** Live order card: 0–100 and a stage label. */
  progress?: number;
  stage?: string;
  /** Legacy Android channel + sound for old app builds. */
  legacyChannelId?: string;
  legacySound?: string;
}

/** Brand accent used to colourise native alerts (TMDS Indigo). */
export const ALERT_ACCENT_COLOR = '#3D5AFE';

export function alertDataFields(
  alert: ResolvedAlert,
  content: AlertContent,
): Record<string, string> {
  const fields: Record<string, string> = {
    ...content.data,
    kv: ALERTS_PAYLOAD_VERSION,
    title: content.title,
    body: content.body,
    event: alert.event,
    tier: alert.tier,
    sound: alert.sound,
    loopSeconds: String(alert.loopSeconds),
    vibrate: alert.vibrate ? '1' : '0',
    vibration: alert.vibration.join(','),
    channelId: alert.androidChannelId,
    path: content.path,
    tag: content.tag,
    accent: ALERT_ACCENT_COLOR,
    sentAt: String(Date.now()),
  };
  if (content.subtitle) fields.subtitle = content.subtitle;
  if (content.alertId) fields.alertId = content.alertId;
  if (content.ackUrl) fields.ackUrl = content.ackUrl;
  if (content.expiresAt) fields.expiresAt = String(content.expiresAt);
  if (content.actions?.length) fields.actions = JSON.stringify(content.actions);
  if (content.isRepeat) fields.repeat = '1';
  if (typeof content.progress === 'number')
    fields.progress = String(Math.max(0, Math.min(100, Math.round(content.progress))));
  if (content.stage) fields.stage = content.stage;
  // FCM data values must be strings and the whole payload ≤ 4 KB.
  for (const key of Object.keys(fields)) {
    const value = fields[key];
    if (value === undefined || value === null) delete fields[key];
    else if (typeof value !== 'string') fields[key] = String(value);
  }
  return fields;
}

function ttlSeconds(alert: ResolvedAlert, content: AlertContent): number {
  if (alert.tier === 'ring') {
    // A ring that arrives after the offer closed is worse than none.
    if (content.expiresAt) return Math.max(30, Math.floor((content.expiresAt - Date.now()) / 1000));
    return alert.loopSeconds + 90;
  }
  if (alert.tier === 'silent') return 600;
  return 24 * 3600;
}

export function buildAlertMessages(
  devices: DeviceTarget[],
  alert: ResolvedAlert,
  content: AlertContent,
): Message[] {
  const data = alertDataFields(alert, content);
  const ttl = ttlSeconds(alert, content);
  const urgent = alert.tier === 'ring';

  return devices.map((device): Message => {
    const platform = (device.platform || '').toLowerCase();

    if (platform === 'ios') {
      return {
        token: device.token,
        data,
        apns: {
          headers: {
            'apns-priority': alert.tier === 'silent' ? '5' : '10',
            'apns-push-type': 'alert',
            'apns-expiration': String(Math.floor(Date.now() / 1000) + ttl),
            'apns-collapse-id': content.tag.slice(0, 64),
          },
          payload: {
            aps: {
              alert: {
                title: content.title,
                subtitle: content.subtitle,
                body: content.body,
              },
              ...(alert.tier === 'silent' ? {} : { sound: `${alert.sound}.wav` }),
              'interruption-level': urgent
                ? 'time-sensitive'
                : alert.tier === 'silent'
                  ? 'passive'
                  : 'active',
              'thread-id': content.tag,
            },
          },
        },
      };
    }

    if (platform === 'web' || platform === '') {
      return {
        token: device.token,
        data,
        webpush: {
          headers: {
            Urgency: urgent ? 'high' : alert.tier === 'silent' ? 'low' : 'normal',
            TTL: String(ttl),
          },
        },
      };
    }

    // Native Android (Capacitor) – default for "android" and unknown platforms.
    if (device.alertsVersion >= NATIVE_ALERTS_MIN_VERSION) {
      return {
        token: device.token,
        data,
        android: {
          priority: alert.tier === 'silent' ? 'normal' : 'high',
          ttl: ttl * 1000,
        },
      };
    }

    return {
      token: device.token,
      notification: { title: content.title, body: content.body },
      data,
      android: {
        priority: 'high',
        ttl: ttl * 1000,
        notification: {
          sound: content.legacySound,
          channelId: content.legacyChannelId,
          tag: content.tag,
        },
      },
    };
  });
}
