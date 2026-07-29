import { NotificationCategory } from '@kavio/database';

/**
 * Custom notification sounds (NOT-02).
 *
 * A hard platform limit shapes this whole module: no current browser lets a
 * site choose the sound a BACKGROUND push notification plays — the Push API
 * and Notification API have no `sound` option any shipping browser honours, so
 * a closed tab always gets the device's own default chime, full stop.
 *
 * What IS real: while Kavio is open in a tab, the app can play any audio
 * file it likes the instant a notification arrives (the service worker relays
 * the push payload to open clients, which play the sound with a plain `Audio`
 * element — see apps/web/lib/notification-sound.ts). So "custom sound" here
 * means "custom sound while the app is open"; everywhere else, the promise is
 * exactly what was asked for — unset falls back to the device's own default.
 *
 * `soundKey` therefore travels on the notification (persisted on the in-app
 * row, carried in the web-push payload) purely as DATA for the client to act
 * on if it can. It is never assumed to control the OS-level notification.
 */

export const NOTIFICATION_SOUND_KEYS = ['default', 'chime', 'alert', 'pulse', 'silent'] as const;

export type NotificationSoundKey = (typeof NOTIFICATION_SOUND_KEYS)[number];

export function isNotificationSoundKey(value: unknown): value is NotificationSoundKey {
  return (
    typeof value === 'string' && (NOTIFICATION_SOUND_KEYS as readonly string[]).includes(value)
  );
}

/**
 * The sound a category plays when a user has never chosen an override.
 * SAFETY and DISPUTES get the more urgent "alert" tone; everything else gets
 * a calmer default so routine traffic does not sound like an emergency.
 */
const CATEGORY_DEFAULT_SOUND: Record<NotificationCategory, NotificationSoundKey> = {
  [NotificationCategory.SECURITY]: 'alert',
  [NotificationCategory.ACCOUNT]: 'default',
  [NotificationCategory.JOBS]: 'chime',
  [NotificationCategory.QUOTES]: 'chime',
  [NotificationCategory.MESSAGES]: 'chime',
  [NotificationCategory.PAYMENTS]: 'pulse',
  [NotificationCategory.TRUST]: 'default',
  [NotificationCategory.REVIEWS]: 'default',
  [NotificationCategory.DISPUTES]: 'alert',
  [NotificationCategory.SAFETY]: 'alert',
  [NotificationCategory.MARKETING]: 'silent',
};

export function defaultSoundFor(category: NotificationCategory): NotificationSoundKey {
  return CATEGORY_DEFAULT_SOUND[category];
}

/** An override wins when it is one of the known keys; a stale/invalid value never breaks delivery. */
export function resolveSoundKey(
  category: NotificationCategory,
  override: string | null | undefined,
): NotificationSoundKey {
  return isNotificationSoundKey(override) ? override : defaultSoundFor(category);
}
