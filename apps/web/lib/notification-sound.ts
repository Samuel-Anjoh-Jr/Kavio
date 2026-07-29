'use client';

import type { NotificationSoundKey } from '@/lib/notifications';

/**
 * Custom notification sounds — the part of it that is actually real (NOT-02).
 *
 * No browser lets a site choose the sound a BACKGROUND push notification
 * plays; the OS/browser always uses its own default chime regardless of
 * anything sent in the push payload. What IS real: while TrustPro is open in
 * a tab, the service worker relays the push payload here the instant it
 * arrives (see components/pwa/service-worker-register.tsx, which turns the
 * SW's `notification-push` postMessage into a `trustpro:notification-push`
 * window event), and a plain `Audio` element can play anything. So this
 * player only ever runs for that one case — everywhere else, "custom sound"
 * correctly degrades to "the device's own default", exactly as if nothing
 * had been set at all.
 *
 * Placeholder assets: short synthesized tones, not final production sounds —
 * swap the files in public/sounds/ for real ones without touching this map.
 */
const SOUND_FILES: Record<Exclude<NotificationSoundKey, 'silent'>, string> = {
  default: '/sounds/default.wav',
  chime: '/sounds/chime.wav',
  alert: '/sounds/alert.wav',
  pulse: '/sounds/pulse.wav',
};

/** Plays a notification sound by key. 'silent' and unknown keys are deliberate no-ops. */
export function playNotificationSound(soundKey: string | null | undefined): void {
  if (!soundKey || soundKey === 'silent' || typeof Audio === 'undefined') return;

  const src = SOUND_FILES[soundKey as keyof typeof SOUND_FILES];
  if (!src) return;

  try {
    const audio = new Audio(src);
    audio.volume = 0.6;
    // Autoplay can be blocked before any user gesture on the page; a push
    // arriving is not itself a gesture, so a rejection here is expected on
    // some browsers and must not surface as an error.
    void audio.play().catch(() => undefined);
  } catch {
    // Never let a sound glitch take down the notification it was decorating.
  }
}
