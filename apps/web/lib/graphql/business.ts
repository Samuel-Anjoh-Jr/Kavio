import { gql } from '@apollo/client';
import type { TeamAccessLevel, TeamMemberRole, TeamMemberStatus } from '@/lib/business';

/**
 * Business READS (DUAL API RULE; BIZ-01, BIZ-02, BIZ-03). Writes are REST
 * (lib/business.ts). Mirrors apps/api/src/business/models/business.model.ts.
 *
 * Nothing here is public: a company's spend, roster and hire rate are its own
 * business. Every query resolves the caller's access level server-side before
 * returning a row, so a staff member scoped to jobs gets an authorisation error
 * on `companyPayments` rather than a redacted one — which is why the dashboard
 * asks `myBusinessAccess` FIRST and only mounts the panels it may read.
 */

export type BusinessCapability =
  'business:view' | 'business:jobs' | 'business:payments' | 'business:team' | 'business:profile';

export interface BusinessAccess {
  businessProfileId: string;
  isOwner: boolean;
  /** NULL for the owner, who is not scoped by an access level. */
  accessLevel: TeamAccessLevel | null;
  capabilities: BusinessCapability[];
}

export interface BusinessSpend {
  businessProfileId: string;
  committedToEscrow: number;
  totalSpent: number;
  platformFees: number;
  totalRefunded: number;
}

export interface BusinessDashboard {
  businessProfileId: string;
  name: string;
  verified: boolean;
  activePosts: number;
  draftPosts: number;
  pendingApplications: number;
  inProgressJobs: number;
  completedJobs: number;
  spend: BusinessSpend;
}

export interface BusinessAnalytics {
  businessProfileId: string;
  jobsPosted: number;
  jobsHired: number;
  /** NULL before anything has been posted — not the same as a 0% hire rate. */
  hireRate: number | null;
  completedJobs: number;
  totalSpent: number;
  averageJobValue: number | null;
  averageRating: number | null;
  ratedJobs: number;
}

export interface CompanyPayment {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  jobTitle: string | null;
  bookingId: string | null;
  createdAt: string;
  settledAt: string | null;
}

export interface TeamMember {
  id: string;
  /** NULL while the invitation is outstanding — an unbound seat grants nothing. */
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  role: TeamMemberRole;
  accessLevel: TeamAccessLevel;
  status: TeamMemberStatus;
  invitationSentAt: string | null;
  invitationExpiresAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

export interface CorporateEligibility {
  businessProfileId: string;
  eligible: boolean;
  verifiedBusiness: boolean;
  verifiedAt: string | null;
  ownerTier: string;
  /** Coded: BUSINESS_REGISTRATION_NOT_APPROVED, OWNER_NOT_TIER_3. */
  unmet: string[];
}

export const MY_BUSINESS_ACCESS_QUERY = gql`
  query MyBusinessAccess($businessProfileId: ID) {
    myBusinessAccess(businessProfileId: $businessProfileId) {
      businessProfileId
      isOwner
      accessLevel
      capabilities
    }
  }
`;

export interface MyBusinessAccessQueryResult {
  myBusinessAccess: BusinessAccess;
}

export const BUSINESS_DASHBOARD_QUERY = gql`
  query BusinessDashboard($businessProfileId: ID) {
    businessDashboard(businessProfileId: $businessProfileId) {
      businessProfileId
      name
      verified
      activePosts
      draftPosts
      pendingApplications
      inProgressJobs
      completedJobs
      spend {
        businessProfileId
        committedToEscrow
        totalSpent
        platformFees
        totalRefunded
      }
    }
  }
`;

export interface BusinessDashboardQueryResult {
  businessDashboard: BusinessDashboard;
}

export const BUSINESS_ANALYTICS_QUERY = gql`
  query BusinessAnalytics($businessProfileId: ID) {
    businessAnalytics(businessProfileId: $businessProfileId) {
      businessProfileId
      jobsPosted
      jobsHired
      hireRate
      completedJobs
      totalSpent
      averageJobValue
      averageRating
      ratedJobs
    }
  }
`;

export interface BusinessAnalyticsQueryResult {
  businessAnalytics: BusinessAnalytics;
}

export const COMPANY_PAYMENTS_QUERY = gql`
  query CompanyPayments($businessProfileId: ID) {
    companyPayments(businessProfileId: $businessProfileId) {
      id
      type
      amount
      description
      jobTitle
      bookingId
      createdAt
      settledAt
    }
  }
`;

export interface CompanyPaymentsQueryResult {
  companyPayments: CompanyPayment[];
}

export const BUSINESS_TEAM_QUERY = gql`
  query BusinessTeam($businessProfileId: ID) {
    businessTeam(businessProfileId: $businessProfileId) {
      id
      userId
      name
      email
      phone
      title
      role
      accessLevel
      status
      invitationSentAt
      invitationExpiresAt
      acceptedAt
      createdAt
    }
  }
`;

export interface BusinessTeamQueryResult {
  businessTeam: TeamMember[];
}

export const CORPORATE_ELIGIBILITY_QUERY = gql`
  query CorporateEligibility($businessProfileId: ID) {
    corporateEligibility(businessProfileId: $businessProfileId) {
      businessProfileId
      eligible
      verifiedBusiness
      verifiedAt
      ownerTier
      unmet
    }
  }
`;

export interface CorporateEligibilityQueryResult {
  corporateEligibility: CorporateEligibility;
}
