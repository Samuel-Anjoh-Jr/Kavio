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
