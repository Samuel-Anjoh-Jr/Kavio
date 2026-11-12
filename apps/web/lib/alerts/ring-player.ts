'use client';

import { hasNativeAlerts, stopNativeRing } from './native-alerts';

/**
 * In-app ring: what makes a funded booking or a job invitation behave like a
 * phone call while Kavio is open (the native RingService and the service
 * worker's sticky banner cover the closed case).
 *
 *  - loops the brand ringtone for `loopSeconds` (admin: notifications.ringLoopSeconds)
 *  - repeats the vibration pattern while it rings
 *  - holds a screen wake lock and sets the app-icon badge
 *  - flashes the tab title
 *  - inside the native app, leaves audio to the native ring service so the
 *    two never play over each other
 *
 * Sounds are the shared ASK-O brand set in public/sounds/brand/.
 */
export interface RingOptions {
  sound: string;
  loopSeconds: number;
  vibration?: number[];
  vibrate?: boolean;
  title?: string;
}

const DEFAULT_VIBRATION = [0, 900, 400, 900, 400, 900, 1200];

let audio: HTMLAudioElement | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let vibrateTimer: ReturnType<typeof setInterval> | null = null;
let titleTimer: ReturnType<typeof setInterval> | null = null;
let originalTitle: string | null = null;
let wakeLock: { release: () => Promise<void> } | null = null;
let ringing = false;
let onStopCallbacks: Array<() => void> = [];

export function onRingStop(callback: () => void): () => void {
  onStopCallbacks.push(callback);
  return () => {
    onStopCallbacks = onStopCallbacks.filter((cb) => cb !== callback);
  };
}

/** Brand sound URL. Unknown names fall back to the generic notification. */
export function brandSoundUrl(sound: string): string {
  const safe = sound.replace(/[^a-z_]/g, '');
  return `/sounds/brand/${safe || 'generic_notification'}.mp3`;
}

/** Start ringing. Resolves false when autoplay is blocked (the sheet asks for a tap). */
export async function startRing(options: RingOptions): Promise<boolean> {
  stopRing({ silentCallbacks: true });
  ringing = true;
  const seconds = Math.max(5, Math.min(120, options.loopSeconds || 30));
  const native = hasNativeAlerts();

  let audioStarted = native;
  if (!native && typeof Audio !== 'undefined') {
    audio = new Audio(brandSoundUrl(options.sound));
    audio.loop = true;
    audio.volume = 1;
    try {
      await audio.play();
      audioStarted = true;
    } catch {
      audioStarted = false;
    }
  }

  if (
    !native &&
    options.vibrate !== false &&
    typeof navigator !== 'undefined' &&
    'vibrate' in navigator
  ) {
    const pattern = options.vibration?.length ? options.vibration : DEFAULT_VIBRATION;
    const cycle = pattern.reduce((sum, ms) => sum + ms, 0) || 2000;
    const buzz = () => {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Some browsers throw when the page is not focused.
      }
    };
    buzz();
    vibrateTimer = setInterval(buzz, cycle);
  }

  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null;
  }

  try {
    await navigator.setAppBadge?.(1);
  } catch {
    // Badging is best-effort.
  }

  if (typeof document !== 'undefined' && options.title) {
    originalTitle = document.title;
    let on = false;
    titleTimer = setInterval(() => {
      on = !on;
      document.title = on ? `🔔 ${options.title}` : (originalTitle ?? '');
    }, 1000);
  }

  stopTimer = setTimeout(() => stopRing(), seconds * 1000);
  return audioStarted;
}

/** Retry audio after a user gesture (used when autoplay was blocked). */
export async function resumeRingAudio(): Promise<boolean> {
  if (!ringing || !audio) return false;
  try {
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

export function stopRing(opts: { silentCallbacks?: boolean } = {}): void {
  const wasRinging = ringing;
  ringing = false;
  if (wasRinging) void stopNativeRing();
  if (audio) {
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } catch {
      // ignore
    }
    audio = null;
  }
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = null;
  if (vibrateTimer) clearInterval(vibrateTimer);
  vibrateTimer = null;
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(0);
  } catch {
    // ignore
  }
  if (titleTimer) clearInterval(titleTimer);
  titleTimer = null;
  if (originalTitle !== null && typeof document !== 'undefined') document.title = originalTitle;
  originalTitle = null;
  if (wakeLock) {
    void wakeLock.release().catch(() => undefined);
    wakeLock = null;
  }
  try {
    void navigator.clearAppBadge?.();
  } catch {
    // ignore
  }
  if (wasRinging && !opts.silentCallbacks) {
    for (const cb of onStopCallbacks) cb();
  }
}

/** One branded sound for "once" alerts (money received, quote, status update). */
export function playOnce(sound: string, vibration?: number[]): void {
  if (typeof Audio === 'undefined') return;
  try {
    const a = new Audio(brandSoundUrl(sound));
    a.volume = 0.9;
    void a.play().catch(() => undefined);
  } catch {
    // ignore
  }
  if (vibration?.length && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(vibration);
    } catch {
      // ignore
    }
  }
}
