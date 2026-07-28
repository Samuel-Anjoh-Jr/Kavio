'use client';

import type { StatusTone } from '@/components/ui/status-badge';
import { restPatch, restPost } from '@/lib/rest-api';
import type { NotificationCategory, NotificationChannel } from '@/lib/graphql/notifications';

/**
 * Notification Center WRITES + shared vocabulary (NOT-02, SET-02). Reads are
 * GraphQL (lib/graphql/notifications.ts).
 */

/** The Notification Center filter tabs (NOT-02). */
export type NotificationFilter = 'ALL' | 'UNREAD' | 'IMPORTANT';

export const NOTIFICATION_FILTERS: readonly NotificationFilter[] = ['ALL', 'UNREAD', 'IMPORTANT'];

/**
 * The channels the preferences grid exposes, in display order (NOT-02).
 *
 * SECURITY is deliberately absent from the CATEGORY rows below: security notices
 * bypass preferences and always go by email (SRS §17), so a toggle for them would
 * be a switch that does nothing — the API refuses it, and the UI must not offer
 * a control it knows is a lie.
 */
export const PREFERENCE_CHANNELS: readonly NotificationChannel[] = [
  'IN_APP',
  'WEB_PUSH',
  'EMAIL',
  'SMS',
];

/** Categories a user can tune, in the order the settings screen lists them. */
export const PREFERENCE_CATEGORIES: readonly NotificationCategory[] = [
  'JOBS',
  'QUOTES',
  'MESSAGES',
  'PAYMENTS',
  'TRUST',
  'REVIEWS',
  'DISPUTES',
  'SAFETY',
  'ACCOUNT',
  'MARKETING',
];

/** Tone for a notification's category dot in the list. */
export const CATEGORY_TONE: Record<NotificationCategory, StatusTone> = {
  SECURITY: 'danger',
  ACCOUNT: 'neutral',
  JOBS: 'primary',
  QUOTES: 'primary',
  MESSAGES: 'accent',
  PAYMENTS: 'success',
  TRUST: 'success',
  REVIEWS: 'accent',
  DISPUTES: 'warning',
  SAFETY: 'danger',
  MARKETING: 'neutral',
};

export function markNotificationRead(id: string): Promise<{ updated: number }> {
  return restPost<{ updated: number }>(`notifications/${id}/read`);
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return restPost<{ updated: number }>('notifications/read-all');
}

export function setNotificationPreference(input: {
  channel: NotificationChannel;
  category: NotificationCategory;
  enabled: boolean;
}): Promise<{ channel: NotificationChannel; category: string; enabled: boolean }> {
  return restPatch('notifications/preferences', input);
}

/**
 * The fixed sound keys the API understands (see apps/api/src/notifications/
 * notification-sound.ts). Only ever plays while TrustPro is open in a tab —
 * no browser lets a site choose the sound for a BACKGROUND push notification,
 * so "Default" here really means "let the device pick", the same as leaving
 * it unset.
 */
export const NOTIFICATION_SOUND_KEYS = ['default', 'chime', 'alert', 'pulse', 'silent'] as const;

export type NotificationSoundKey = (typeof NOTIFICATION_SOUND_KEYS)[number];

export function setNotificationSoundPreference(input: {
  category: NotificationCategory;
  soundKey: NotificationSoundKey;
}): Promise<{ category: string; soundKey: string }> {
  return restPatch('notifications/sound-preferences', input);
}
