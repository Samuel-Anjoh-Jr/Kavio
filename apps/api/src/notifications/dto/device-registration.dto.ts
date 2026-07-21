import { z } from 'zod';

/**
 * Web-push subscription DTOs (NOT-01). The shape mirrors the browser's
 * `PushSubscription.toJSON()` — endpoint plus the p256dh/auth encryption keys —
 * so the client registers by posting the subscription almost verbatim.
 */
export const registerDeviceSchema = z
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
export type RegisterDeviceDto = z.infer<typeof registerDeviceSchema>;

export const unregisterDeviceSchema = z
  .object({
    endpoint: z.string().url().max(2000),
  })
  .strict();
export type UnregisterDeviceDto = z.infer<typeof unregisterDeviceSchema>;
