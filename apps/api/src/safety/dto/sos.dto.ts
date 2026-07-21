import { z } from 'zod';
import { SOSStatus } from '@trustpro/database';

/**
 * Safety & SOS WRITE DTOs (SOS-01, SOS-02, SOS-03). Validated with Zod before the
 * DB. Reads are GraphQL and carry no DTO.
 */

/** Triggers an SOS alert, capturing the person's position (SOS-01). */
export const triggerSosSchema = z
  .object({
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accuracy: z.number().nonnegative().optional(),
    message: z.string().trim().max(1000).optional(),
    /** The job/booking in progress when it was triggered, for the safety review. */
    jobId: z.string().uuid().optional(),
    bookingId: z.string().uuid().optional(),
  })
  .strict();
export type TriggerSosDto = z.infer<typeof triggerSosSchema>;

/** Resolves an active alert (SOS-03). Only the two closing states are settable. */
export const resolveSosSchema = z
  .object({
    status: z.enum([SOSStatus.RESOLVED, SOSStatus.FALSE_ALARM]),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();
export type ResolveSosDto = z.infer<typeof resolveSosSchema>;

/** A live position update on an active alert, so responders track the person. */
export const updateSosLocationSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().nonnegative().optional(),
  })
  .strict();
export type UpdateSosLocationDto = z.infer<typeof updateSosLocationSchema>;

/** Adds an emergency contact (SOS-02). Phone is normalised to E.164 downstream. */
export const createEmergencyContactSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(6).max(20),
    relationship: z.string().trim().max(60).optional(),
    email: z.string().trim().email().max(255).optional(),
  })
  .strict();
export type CreateEmergencyContactDto = z.infer<typeof createEmergencyContactSchema>;

/** Edits an emergency contact (SOS-02). */
export const updateEmergencyContactSchema = createEmergencyContactSchema.partial().strict();
export type UpdateEmergencyContactDto = z.infer<typeof updateEmergencyContactSchema>;
