import { z } from 'zod';
import { ADMIN_ADJUSTMENT_MAX_MAGNITUDE } from '../trust-score.model';

/**
 * Admin Trust Score adjustment (ADM-04). REST, per the DUAL API RULE.
 *
 * The `reason` is required and substantial on purpose: ADM-04 is an EXCEPTIONAL
 * action against the platform's core signal, and "exceptional" with an optional
 * one-word justification is just "routine" wearing a coat. The reason is stored
 * on the trust event's metadata and copied into the audit log.
 */
export const adjustTrustScoreSchema = z.object({
  subjectId: z.uuid(),
  /**
   * Signed points. Negative applies a penalty (e.g. a fraud finding), positive a
   * bonus (e.g. a Field-Verified Founding Professional). Bounded to the same
   * magnitude the point model clamps to, so the DTO and the model agree.
   */
  delta: z
    .int('Enter a whole number of points.')
    .refine((v) => v !== 0, 'An adjustment must move the score.')
    .refine(
      (v) => Math.abs(v) <= ADMIN_ADJUSTMENT_MAX_MAGNITUDE,
      `A single adjustment cannot exceed ${ADMIN_ADJUSTMENT_MAX_MAGNITUDE} points.`,
    ),
  reason: z
    .string()
    .trim()
    .min(10, 'Explain why this exceptional adjustment is being made.')
    .max(1000, 'Keep it under 1000 characters.'),
});
export type AdjustTrustScoreDto = z.infer<typeof adjustTrustScoreSchema>;
