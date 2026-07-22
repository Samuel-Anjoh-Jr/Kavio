'use client';

import { restPost } from '@/lib/rest-api';
import type { ReportReason } from '@/lib/reports';

/**
 * Review WRITES (REST, per the DUAL API RULE; REV-01, REV-03). Reads are GraphQL
 * (lib/graphql/reviews.ts).
 *
 * Note what is NOT sent: `subjectId`. Who a review is about is derived from the
 * booking on the job server-side — a request that names its own subject is a
 * request that can name anyone, and "reviews are tied to real completed jobs"
 * would then rest on the client being honest.
 */

export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;
/** Mirrors the API's `photoAssetIds` ceiling so the UI stops before the server does. */
export const REVIEW_PHOTO_MAX = 6;
/** Mirrors the API's `text` ceiling. */
export const REVIEW_TEXT_MAX = 2000;

export interface CreateReviewInput {
  jobId: string;
  rating: number;
  text?: string;
  /** Already-uploaded REVIEW_PHOTO assets. Upload happens first. */
  photoAssetIds?: string[];
}

export interface CreatedReview {
  id: string;
  rating: number;
  subjectId: string;
}

export function createReview(input: CreateReviewInput): Promise<CreatedReview> {
  return restPost<CreatedReview>('reviews', input);
}

export function reportReview(
  reviewId: string,
  input: { reason: ReportReason; details?: string },
): Promise<{ id: string }> {
  return restPost<{ id: string }>(`reviews/${reviewId}/report`, input);
}

/** Admin moderation (REV-03). The reason is required and is shown to the party. */
export function hideReview(reviewId: string, reason: string): Promise<{ id: string }> {
  return restPost<{ id: string }>(`reviews/${reviewId}/hide`, { reason });
}

export function restoreReview(reviewId: string): Promise<{ id: string }> {
  return restPost<{ id: string }>(`reviews/${reviewId}/restore`);
}
