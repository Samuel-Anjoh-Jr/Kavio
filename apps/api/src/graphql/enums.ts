import { registerEnumType } from '@nestjs/graphql';
import {
  BadgeType,
  EndorsementRelationship,
  GeoRegionLevel,
  LocationSource,
  MediaAssetKind,
  MediaVisibility,
  OnboardingRole,
  Role,
  TrustEventType,
  TrustPillar,
  UserStatus,
  VerificationCheckType,
  VerificationRejectionReason,
  VerificationStage,
  VerificationStatus,
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

  registerEnumType(VerificationStatus, {
    name: 'VerificationStatus',
    description: 'The outcome of a progressive check: pending, verified or rejected (TRU-06).',
  });

  registerEnumType(VerificationStage, {
    name: 'VerificationStage',
    description:
      'Position in the agent/admin review pipeline (AGT-03). Distinct from the outcome: stage is where the work is, status is what was decided.',
  });

  registerEnumType(VerificationRejectionReason, {
    name: 'VerificationRejectionReason',
    description:
      'Coded reason a submission was refused (TRU-07). A code rather than a sentence, so the retry copy stays localized EN/FR.',
  });

  registerEnumType(MediaAssetKind, {
    name: 'MediaAssetKind',
    description: 'What an uploaded file is (TRU-08).',
  });

  registerEnumType(MediaVisibility, {
    name: 'MediaVisibility',
    description:
      'PRIVATE media is served only through short-lived signed URLs; PUBLIC media may be served directly (NFR-SEC-04).',
  });

  registerEnumType(EndorsementRelationship, {
    name: 'EndorsementRelationship',
    description: 'How a community endorser knows the person they vouch for (TRU-10).',
  });

  registerEnumType(BadgeType, {
    name: 'BadgeType',
    description: 'A milestone badge (TRU-11). Derived from trust events, never granted by hand.',
  });

  registerEnumType(GeoRegionLevel, {
    name: 'GeoRegionLevel',
    description:
      'Administrative depth of a region (SRS §12): Country → Region → City → District → Neighbourhood.',
  });

  registerEnumType(LocationSource, {
    name: 'LocationSource',
    description:
      'Where a stored position came from. HUMAN_INPUT always outranks an automatic fix (DIS-09).',
  });
}
