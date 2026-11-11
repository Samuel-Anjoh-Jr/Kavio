'use client';

import { restPost } from '@/lib/rest-api';
import { isNativeApp, nativeAlertsVersion, nativePlatform } from './native-alerts';

/**
 * Native push for the Capacitor app (com.kavio.app).
 *
 * The app shell has no service worker push (Android WebView has no Push API),
 * so it registers its FCM token instead. The API stores it as `fcm:<token>`
 * next to web subscriptions and sends data-only alerts v2 to it; the native
 * KavioAlerts service draws the ring/banner even when the app is closed.
 *
 * Foreground messages are re-dispatched as a `kavio:alert` window event so
 * the ring sheet handles them exactly like a relayed web push.
 */
let started = false;

export async function startNativePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isNativeApp()) return { ok: false, reason: 'not_native' };
  if (started) return { ok: true };
  started = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const permission = await PushNotifications.checkPermissions();
    const status =
      permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale'
        ? (await PushNotifications.requestPermissions()).receive
        : permission.receive;
    if (status !== 'granted') {
      started = false;
      return { ok: false, reason: 'denied' };
    }

    await PushNotifications.addListener('registration', ({ value }) => {
      // An iOS build without Firebase hands over the raw APNs token (64 hex
      // chars); the API sends through FCM only, so it is not registered.
      if (/^[0-9a-f]{64}$/i.test(value)) return;
      void nativeAlertsVersion().then((alertsVersion) =>
        restPost('notifications/devices', {
          platform: nativePlatform() === 'ios' ? 'IOS' : 'ANDROID',
          fcmToken: value,
          alertsVersion,
        }).catch(() => undefined),
      );
    });
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const data = (notification.data ?? {}) as Record<string, string>;
      window.dispatchEvent(new CustomEvent('kavio:alert', { detail: data }));
    });
    await PushNotifications.register();
    return { ok: true };
  } catch {
    started = false;
    return { ok: false, reason: 'error' };
  }
}
