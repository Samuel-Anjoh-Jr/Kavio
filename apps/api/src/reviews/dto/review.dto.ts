import { AbuseReportReason } from '@kavio/database';
import { z } from 'zod';
import { REVIEW_RATING_MAX, REVIEW_RATING_MIN } from '../review.model';

/**
 * Review writes (REV-01, REV-03). REST, per the DUAL API RULE.
 *
 * Note what is NOT here: `subjectId`. Who a review is about is derived from the
 * booking on the job, never accepted from the caller — a request that names its
 * own subject is a request that can name anyone, and "reviews are tied to real
 * completed jobs" (REV-02) would then rest on the client being honest.
 */

/** Leaving a review after a completed job (REV-01). */
export const createReviewSchema = z.object({
  jobId: z.uuid(),
  rating: z
    .int()
    .min(REVIEW_RATING_MIN, 'Give a rating between 1 and 5 stars.')
    .max(REVIEW_RATING_MAX, 'Give a rating between 1 and 5 stars.'),
  /** Optional: REV-01 asks for stars plus a review, not stars plus an essay. */
  text: z.string().trim().max(2000, 'Keep it under 2000 characters.').optional(),
  /** Already-uploaded REVIEW_PHOTO assets. Upload happens first. */
  photoAssetIds: z.array(z.uuid()).max(6, 'Attach up to 6 photos.').optional(),
});
export type CreateReviewDto = z.infer<typeof createReviewSchema>;

/**
 * Reporting a review (REV-03).
 *
 * Reuses AbuseReportReason rather than declaring a review-specific list: the
 * report lands in the one moderation queue (ADM-08), and a queue whose reason
 * column means different things depending on the target type cannot be filtered.
 */
export const reportReviewSchema = z.object({
  reason: z.enum(AbuseReportReason),
  details: z.string().trim().max(1000).optional(),
});
export type ReportReviewDto = z.infer<typeof reportReviewSchema>;

/**
 * Hiding a review (REV-03, admin). The reason is REQUIRED: taking down someone's
 * published account of a job they paid for is a decision that has to be
 * explainable afterwards, and an optional field is one that ends up empty.
 */
export const hideReviewSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Say why this review is being taken down.')
    .max(1000, 'Keep it under 1000 characters.'),
});
export type HideReviewDto = z.infer<typeof hideReviewSchema>;
