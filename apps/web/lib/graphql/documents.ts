import { gql } from '@apollo/client';

/**
 * Every READ in the app is one of these (DUAL API RULE). Writes are REST calls
 * in lib/rest-api.ts and never go through Apollo.
 */

export const ME_QUERY = gql`
  query Me {
    me {
      id
      name
      email
      phone
      avatar
      locale
      status
      tier
      trustScore
      activeRole
      permissions
      roles {
        role
        isActive
        grantedAt
      }
    }
  }
`;

export const ONBOARDING_QUERY = gql`
  query Onboarding($role: OnboardingRole!) {
    onboarding(role: $role) {
      role
      currentStep
      completionPercent
      completedAt
      completedSteps
      data
      unlocks {
        key
        threshold
        unlocked
      }
    }
  }
`;

/**
 * The Trust Score breakdown (TRU-04). `improvements` comes back null unless the
 * viewer is the subject or staff, which is what the screen keys its "do this
 * next" section off — see apps/api/src/trust/trust.service.ts.
 */
export const TRUST_BREAKDOWN_QUERY = gql`
  query TrustBreakdown($subjectId: ID!) {
    trustBreakdown(subjectId: $subjectId) {
      subjectId
      total
      tier
      suspended
      subScores {
        pillar
        points
        max
        scored
        contributions {
          type
          occurrences
          points
          max
          maxed
          improvementKey
        }
      }
      tierStatus {
        subjectId
        tier
        labelKey
        verified
        nextTier
        requirements {
          kind
          checkType
          labelKey
          required
          current
        }
      }
      improvements {
        type
        occurrences
        points
        max
        maxed
        improvementKey
      }
    }
  }
`;

export interface TrustBreakdownQueryResult {
  trustBreakdown: import('@/lib/trust').TrustBreakdown;
}

/** The signed-in worker's own checks — drives the gamified screen (TRU-05, TRU-06). */
export const MY_VERIFICATIONS_QUERY = gql`
  query MyVerifications {
    myVerifications {
      id
      checkType
      status
      stage
      attempt
      rejectionReason
      rejectionKey
      retryable
      infoRequest
      submittedAt
      reviewedAt
    }
  }
`;

export interface MyVerificationsQueryResult {
  myVerifications: import('@/lib/verification').VerificationRecord[];
}

/** Per-stage counts and throughput for the review board header (AGT-02, AGT-03). */
export const VERIFICATION_PIPELINE_QUERY = gql`
  query VerificationPipeline($windowDays: Int) {
    verificationPipeline(windowDays: $windowDays) {
      stages {
        stage
        count
      }
      pending
      approved
      rejected
      averageReviewMinutes
      approvalRate
      windowDays
    }
  }
`;

export interface VerificationPipelineQueryResult {
  verificationPipeline: {
    stages: { stage: string; count: number }[];
    pending: number;
    approved: number;
    rejected: number;
    averageReviewMinutes: number | null;
    approvalRate: number | null;
    windowDays: number;
  };
}

/**
 * One column of the review board. Queried per stage rather than once for
 * everything so a busy SUBMITTED column cannot force the whole board to page.
 */
export const VERIFICATION_QUEUE_QUERY = gql`
  query VerificationQueue($stage: VerificationStage, $limit: Int, $offset: Int) {
    verificationQueue(stage: $stage, limit: $limit, offset: $offset) {
      id
      subjectId
      subjectName
      subjectTier
      subjectTrustScore
      checkType
      stage
      attempt
      assignedToId
      documentIds
      submittedAt
      stageUpdatedAt
    }
  }
`;

export interface VerificationQueueItem {
  id: string;
  subjectId: string;
  subjectName: string | null;
  subjectTier: import('@/lib/trust').VerificationTier;
  subjectTrustScore: number;
  checkType: import('@/lib/verification').VerificationCheckType;
  stage: import('@/lib/verification').VerificationStage;
  attempt: number;
  assignedToId: string | null;
  documentIds: string[];
  submittedAt: string;
  stageUpdatedAt: string;
}

export interface VerificationQueueQueryResult {
  verificationQueue: VerificationQueueItem[];
}

/**
 * One document plus a SHORT-LIVED SIGNED URL, minted per request.
 *
 * Deliberately not batched into the queue query: a signed KYC URL should be
 * created when a reviewer actually opens the document, not handed out for every
 * card on a board they merely scrolled past. Staff reads are audit-logged
 * server-side, and that log is only meaningful if a read means someone looked.
 */
export const DOCUMENT_QUERY = gql`
  query Document($id: ID!) {
    document(id: $id) {
      id
      kind
      mimeType
      sizeBytes
      visibility
      url
      status
      checkType
      rejectionKey
      createdAt
    }
  }
`;

export interface DocumentQueryResult {
  document: {
    id: string;
    kind: string;
    mimeType: string;
    sizeBytes: number;
    visibility: string;
    url: string | null;
    status: string | null;
    checkType: string | null;
    rejectionKey: string | null;
    createdAt: string;
  };
}

/** Shapes the components above consume. Kept hand-written: codegen lands later. */
export interface MeRoleGrant {
  role: string;
  isActive: boolean;
  grantedAt: string;
}

export interface MeQueryResult {
  me: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    avatar: string | null;
    locale: string;
    status: string;
    tier: string;
    trustScore: number;
    activeRole: string;
    permissions: string[];
    roles: MeRoleGrant[];
  };
}

export interface OnboardingUnlock {
  key: string;
  threshold: number;
  unlocked: boolean;
}

export interface OnboardingQueryResult {
  onboarding: {
    role: string;
    currentStep: string;
    completionPercent: number;
    completedAt: string | null;
    completedSteps: string[];
    data: Record<string, unknown>;
    unlocks: OnboardingUnlock[];
  };
}

/**
 * Why the signed-in worker's profile is or is not publicly listable (TRU-05).
 * One query, because the dashboard banner is a single decision — hide it, ask
 * for a code, or ask for an ID — and three separate reads could disagree
 * mid-render about which step the worker is on.
 */
export const MY_DISCOVERY_STATUS_QUERY = gql`
  query MyDiscoveryStatus {
    myDiscoveryStatus {
      requiredChannel
      phoneVerified
      emailVerified
      contactVerified
      idVerified
      discoverable
      otpDestination
      otpChannel
    }
  }
`;

export interface MyDiscoveryStatus {
  requiredChannel: 'PHONE' | 'EMAIL' | 'EITHER';
  phoneVerified: boolean;
  emailVerified: boolean;
  contactVerified: boolean;
  idVerified: boolean;
  discoverable: boolean;
  otpDestination: string | null;
  otpChannel: 'PHONE' | 'EMAIL' | null;
}

export interface MyDiscoveryStatusQueryResult {
  myDiscoveryStatus: MyDiscoveryStatus;
}
