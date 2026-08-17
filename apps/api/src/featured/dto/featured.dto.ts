import { z } from 'zod';

/**
 * Write DTOs, validated before anything reaches the database (NFR-SEC-03).
 *
 * Messages are written for the person who will see them inline on the form, not
 * for the developer reading a stack trace.
 */

export const approveFeaturedSchema = z.object({
  // Basis points, admin-configurable with no fixed tiers — the same bound as
  // computeFeeSplit's feeBps (0-10000 = 0-100%).
  extraCommissionBps: z
    .number()
    .int({ message: 'Enter a whole number of basis points.' })
    .min(0, { message: 'The extra commission cannot be negative.' })
    .max(10_000, { message: 'The extra commission cannot exceed 100%.' }),
  // Internal reviewer note. Never shown to the subject.
  note: z.string().trim().max(500).optional(),
});

export type ApproveFeaturedDto = z.infer<typeof approveFeaturedSchema>;

export const rejectFeaturedSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, { message: 'Say what is needed, so they know why this was declined.' })
    .max(500),
  note: z.string().trim().max(500).optional(),
});

export type RejectFeaturedDto = z.infer<typeof rejectFeaturedSchema>;

export const reviewNoteSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type ReviewNoteDto = z.infer<typeof reviewNoteSchema>;
