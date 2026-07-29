import { z } from 'zod';
import { NotificationCategory, NotificationChannel } from '@kavio/database';
import { NOTIFICATION_SOUND_KEYS } from '../notification-sound';

/**
 * Notification Center WRITE DTOs (NOT-02, SET-02). Validated with Zod before the
 * DB, per the engineering standard. Reads are GraphQL and carry no DTO.
 */

/**
 * Toggles one channel × category preference cell.
 *
 * SECURITY is rejected at the edge rather than accepted-and-ignored: security
 * notices bypass preferences by design (SRS §17), so a switch that appears to
 * save but changes nothing would be a lie the UI then has to explain.
 */
export const updateNotificationPreferenceSchema = z
  .object({
    channel: z.nativeEnum(NotificationChannel),
    category: z
      .nativeEnum(NotificationCategory)
      .refine((value) => value !== NotificationCategory.SECURITY, {
        message: 'Security notifications cannot be switched off.',
      }),
    enabled: z.boolean(),
  })
  .strict();

export type UpdateNotificationPreferenceDto = z.infer<typeof updateNotificationPreferenceSchema>;

/** Sets one category's custom sound (NOT-02). See notification-sound.ts for the fixed key set. */
export const updateNotificationSoundSchema = z
  .object({
    category: z.nativeEnum(NotificationCategory),
    soundKey: z.enum(NOTIFICATION_SOUND_KEYS),
  })
  .strict();

export type UpdateNotificationSoundDto = z.infer<typeof updateNotificationSoundSchema>;
