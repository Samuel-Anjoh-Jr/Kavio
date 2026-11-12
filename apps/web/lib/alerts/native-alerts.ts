'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Bridge to the native KavioAlerts plugin (apps/mobile/android/.../alerts/AlertsPlugin.java).
 *
 * The Capacitor shell loads this same web app from the server, so web code
 * can be newer than the installed native build. Everything here checks for
 * the plugin first and degrades to the plain PWA behaviour without it.
 */
export interface AlertOpenedEvent {
  path: string;
  action: 'open' | 'accept' | 'fullscreen' | string;
  tag?: string;
  /** JSON of the original push data (alerts v2 fields). */
  data?: string;
}

interface KavioAlertsPlugin {
  addListener(
    eventName: 'alertOpened',
    listener: (event: AlertOpenedEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  getInfo(): Promise<{ alertsVersion: number; canUseFullScreenIntent: boolean }>;
  stopRing(): Promise<void>;
  openFullScreenIntentSettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
}

const KavioAlerts = registerPlugin<KavioAlertsPlugin>('KavioAlerts');

/** True inside the Android/iOS app shell (not a browser or installed PWA). */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): 'android' | 'ios' | 'web' {
  try {
    const p = Capacitor.getPlatform();
    return p === 'android' || p === 'ios' ? p : 'web';
  } catch {
    return 'web';
  }
}

export function hasNativeAlerts(): boolean {
  try {
    return isNativeApp() && Capacitor.isPluginAvailable('KavioAlerts');
  } catch {
    return false;
  }
}

/** 2 when this build rings natively; 0 for builds without the plugin. */
export async function nativeAlertsVersion(): Promise<number> {
  if (!hasNativeAlerts()) return 0;
  try {
    const info = await KavioAlerts.getInfo();
    return Number(info.alertsVersion) || 0;
  } catch {
    return 0;
  }
}

export async function stopNativeRing(): Promise<void> {
  if (!hasNativeAlerts()) return;
  await KavioAlerts.stopRing().catch(() => undefined);
}

export async function canUseFullScreenAlerts(): Promise<boolean> {
  if (!hasNativeAlerts()) return false;
  try {
    return (await KavioAlerts.getInfo()).canUseFullScreenIntent;
  } catch {
    return false;
  }
}

export async function openFullScreenAlertSettings(): Promise<void> {
  if (!hasNativeAlerts()) return;
  await KavioAlerts.openFullScreenIntentSettings().catch(() => undefined);
}

/** Fires when the app is opened from a native alert (tap, button, full-screen ring). */
export function onNativeAlertOpened(listener: (event: AlertOpenedEvent) => void): () => void {
  if (!hasNativeAlerts()) return () => undefined;
  let handle: { remove: () => Promise<void> } | null = null;
  let removed = false;
  void KavioAlerts.addListener('alertOpened', listener).then((h) => {
    if (removed) void h.remove();
    else handle = h;
  });
  return () => {
    removed = true;
    void handle?.remove();
  };
}
