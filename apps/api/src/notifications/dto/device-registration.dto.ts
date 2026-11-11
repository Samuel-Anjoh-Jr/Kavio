import { z } from 'zod';

/**
 * Web-push subscription DTOs (NOT-01). The shape mirrors the browser's
 * `PushSubscription.toJSON()` — endpoint plus the p256dh/auth encryption keys —
 * so the client registers by posting the subscription almost verbatim.
 */
const webPushDeviceSchema = z
  .object({
    endpoint: z.string().url().max(2000),
    keys: z.object({
      p256dh: z.string().min(1).max(255),
      auth: z.string().min(1).max(255),
    }),
    /** Coarse device label for the "signed-in devices" list; never a fingerprint. */
    deviceName: z.string().trim().max(120).optional(),
  })
  .strict();

/** The native app (Capacitor, apps/mobile) registers its FCM token instead. */
const nativeDeviceSchema = z
  .object({
    platform: z.enum(['ANDROID', 'IOS']),
    fcmToken: z.string().min(20).max(4096),
    /** 2 = this build rings natively from data-only messages. */
    alertsVersion: z.number().int().min(0).max(99).optional(),
    deviceName: z.string().trim().max(120).optional(),
  })
  .strict();

export const registerDeviceSchema = z.union([webPushDeviceSchema, nativeDeviceSchema]);
export type RegisterDeviceDto = z.infer<typeof registerDeviceSchema>;

export const unregisterDeviceSchema = z
  .object({
    endpoint: z.string().url().max(2000),
  })
  .strict();
export type UnregisterDeviceDto = z.infer<typeof unregisterDeviceSchema>;
