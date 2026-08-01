import { gql } from '@apollo/client';

/**
 * Review READS (DUAL API RULE; REV-01, REV-02). Writes are REST (lib/reviews.ts).
 * Mirrors apps/api/src/reviews/models/review.model.ts.
 *
 * The summary and the list are PUBLIC on the API, and this file is used from the
 * guest-browsable worker profile: reviews are the evidence the whole trust
 * proposition rests on, so hiding them behind a login would gut the very screen
 * the guest first-interface exists to lead to (ACC-01).
 *
 * `reviewEligibility` is the one authenticated read here — it is a statement
 * about the CALLER, not about the profile.
 */

export interface RatingDistributionBucket {
  rating: number;
  count: number;
  /** Share of the total, 0–1. Zero when unrated. */
  share: number;
}

export interface ReviewSummary {
  subjectId: string;
  total: number;
  /** NULL when unrated — "no reviews yet" is not "rated zero". */
  average: number | null;
  distribution: RatingDistributionBucket[];
}

export interface ReviewListItem {
  id: string;
  rating: number;
  text: string | null;
  authorId: string;
  authorName: string | null;
  jobId: string;
  jobTitle: string;
  photoUrls: string[];
  createdAt: string;
}

/**
 * Coded outcomes from the API. Codes, not sentences: the EN/FR copy lives in the
 * web catalogue so the server never ships user-facing prose.
 */
export type ReviewEligibilityReason =
  'ELIGIBLE' | 'NO_BOOKING' | 'NOT_A_PARTICIPANT' | 'NOT_COMPLETED' | 'ALREADY_REVIEWED';

export interface ReviewEligibility {
  jobId: string;
  allowed: boolean;
  reason: ReviewEligibilityReason;
  /** Who the review would be about. Derived from the booking, never supplied. */
  subjectId: string | null;
  /** Whether that subject is the worker (vs. the client). Null when subjectId is. */
  subjectIsWorker: boolean | null;
}

export const REVIEW_SUMMARY_QUERY = gql`
  query ReviewSummary($subjectId: ID!) {
    reviewSummary(subjectId: $subjectId) {
      subjectId
      total
      average
      distribution {
        rating
        count
        share
      }
    }
  }
`;

export interface ReviewSummaryQueryResult {
  reviewSummary: ReviewSummary;
}

export const REVIEWS_QUERY = gql`
  query Reviews($subjectId: ID!, $limit: Int, $offset: Int) {
    reviews(subjectId: $subjectId, limit: $limit, offset: $offset) {
      id
      rating
      text
      authorId
      authorName
      jobId
      jobTitle
      photoUrls
      createdAt
    }
  }
`;

export interface ReviewsQueryResult {
  reviews: ReviewListItem[];
}

export const REVIEW_ELIGIBILITY_QUERY = gql`
  query ReviewEligibility($jobId: ID!) {
    reviewEligibility(jobId: $jobId) {
      jobId
      allowed
      reason
      subjectId
      subjectIsWorker
    }
  }
`;

export interface ReviewEligibilityQueryResult {
  reviewEligibility: ReviewEligibility;
}
