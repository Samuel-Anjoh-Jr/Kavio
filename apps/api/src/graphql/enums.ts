import { registerEnumType } from '@nestjs/graphql';
import {
  OnboardingRole,
  Role,
  TrustEventType,
  TrustPillar,
  UserStatus,
  VerificationCheckType,
  VerificationTier,
} from '@trustpro/database';

/**
 * Prisma enums exposed to the GraphQL schema. Registering them ONCE here (rather
 * than beside each type that uses them) keeps a single definition per enum —
 * registering the same name twice is a schema-build error, and the descriptions
 * below end up in the generated SDL that clients read.
 */
export function registerGraphQLEnums(): void {
  registerEnumType(Role, {
    name: 'Role',
    description: 'A role an identity can hold. One identity may hold several.',
  });

  registerEnumType(UserStatus, {
    name: 'UserStatus',
    description: 'Account lifecycle state.',
  });

  registerEnumType(VerificationTier, {
    name: 'VerificationTier',
    description:
      'Progressive verification tier (SRS §21.4). Attached to the identity, not the role, so switching role never re-verifies.',
  });

  registerEnumType(TrustPillar, {
    name: 'TrustPillar',
    description:
      'One of the four trust pillars (SRS §21.6): Identity, Professional, Marketplace, Financial.',
  });

  registerEnumType(TrustEventType, {
    name: 'TrustEventType',
    description: 'A scorable event in the trust ledger (SRS §21.5).',
  });

  registerEnumType(VerificationCheckType, {
    name: 'VerificationCheckType',
    description: 'A progressive verification check behind the tier gates (TRU-06).',
  });

  registerEnumType(OnboardingRole, {
    name: 'OnboardingRole',
    description: 'A role with its own onboarding flow (ACC-10).',
  });
}
