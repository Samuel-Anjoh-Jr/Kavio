import { gql } from '@apollo/client';
import type { VerificationTier } from '@/lib/trust';

/**
 * Sponsored ranking placement READS (DUAL API RULE), mirroring
 * apps/api/src/featured/models/featured.model.ts. Writes are REST
 * (request/approve/reject/pause/resume/revoke), called with restPost directly
 * from the components that need them — there is no lib/featured.ts, the same
 * way job-worker-actions.tsx calls restPost inline rather than through a
 * wrapper module.
 */

export type FeaturedListingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'REVOKED';

export interface FeaturedListing {
  id: string;
  userId: string;
  status: FeaturedListingStatus;
  /** Basis points (0-10000). Null until a reviewer decides. */
  extraCommissionBps: number | null;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedById: string | null;
  /** Why a request was declined — shown to the subject. */
  rejectionReason: string | null;
  pausedAt: string | null;
  revokedAt: string | null;
}

export const MY_FEATURED_STATUS_QUERY = gql`
  query MyFeaturedStatus {
    myFeaturedStatus {
      id
      userId
      status
      extraCommissionBps
      requestedAt
      reviewedAt
      reviewedById
      rejectionReason
      pausedAt
      revokedAt
    }
  }
`;

export interface MyFeaturedStatusResult {
  myFeaturedStatus: FeaturedListing | null;
}

export interface FeaturedQueueItem {
  id: string;
  userId: string;
  name: string | null;
  avatar: string | null;
  activeRole: string | null;
  tier: VerificationTier;
  trustScore: number;
  completedJobs: number;
  requestedAt: string;
}

export const FEATURED_LISTING_REQUESTS_QUERY = gql`
  query FeaturedListingRequests {
    featuredListingRequests {
      id
      userId
      name
      avatar
      activeRole
      tier
      trustScore
      completedJobs
      requestedAt
    }
  }
`;

export interface FeaturedListingRequestsResult {
  featuredListingRequests: FeaturedQueueItem[];
}
