import { z } from 'zod';

/**
 * Live-tracking DTOs (PROMPT 74; SOS-03). Starting/ending a session is a REST
 * write; the position stream itself flows over the WebSocket gateway, validated
 * with the same `pingSchema`.
 */

/**
 * A worker starts sharing their live location for a booking (SOS-03). Consent is
 * explicit — calling this IS the consent — and the viewer (the client) is derived
 * from the booking, never passed in.
 */
export const startTrackingSchema = z
  .object({
    bookingId: z.string().uuid(),
    /** Where the worker is heading. Defaults to the job location server-side. */
    destinationLat: z.number().min(-90).max(90).optional(),
    destinationLng: z.number().min(-180).max(180).optional(),
  })
  .strict();
export type StartTrackingDto = z.infer<typeof startTrackingSchema>;

/** One live position report from the browser Geolocation API (SOS-03). */
export const pingSchema = z
  .object({
    sessionId: z.string().uuid(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().nonnegative().optional(),
    heading: z.number().optional(),
    speed: z.number().nonnegative().optional(),
  })
  .strict();
export type PingDto = z.infer<typeof pingSchema>;
