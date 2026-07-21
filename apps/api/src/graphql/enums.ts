import { registerEnumType } from '@nestjs/graphql';
import { NoProviderReason } from '../search/no-provider.util';
import {
  BadgeType,
  BookingStatus,
  EndorsementRelationship,
  GeoRegionLevel,
  JobApplicationStatus,
  JobInvitationStatus,
  JobStatus,
  JobUrgency,
  LocationSource,
  MediaAssetKind,
  MediaVisibility,
  OnboardingRole,
  PortfolioItemType,
  PortfolioSlot,
  QuoteDurationUnit,
  QuoteStatus,
  Role,
  TeamMemberRole,
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

  registerEnumType(PortfolioItemType, {
    name: 'PortfolioItemType',
    description: 'What a portfolio entry is: a photo, a video or a multi-shot project (PRO-02).',
  });

  registerEnumType(PortfolioSlot, {
    name: 'PortfolioSlot',
    description:
      'Which half of a before/after pair an item is (PRO-02). Null on an ordinary portfolio photo.',
  });

  registerEnumType(TeamMemberRole, {
    name: 'TeamMemberRole',
    description: 'A member’s role within a business team (BIZ-03).',
  });

  registerEnumType(JobStatus, {
    name: 'JobStatus',
    description: 'A job’s lifecycle state (JOB-05, SRS §21.3).',
  });

  registerEnumType(JobUrgency, {
    name: 'JobUrgency',
    description: 'How soon the client needs the work (JOB-02).',
  });

  registerEnumType(JobApplicationStatus, {
    name: 'JobApplicationStatus',
    description: 'A worker’s application status as they track it (JOB-04).',
  });

  registerEnumType(JobInvitationStatus, {
    name: 'JobInvitationStatus',
    description: 'The state of an invitation to quote a job (JOB-03).',
  });

  registerEnumType(QuoteStatus, {
    name: 'QuoteStatus',
    description: 'A quote’s state (QTE-03): Draft, Sent, Viewed, Accepted, Declined, Expired.',
  });

  registerEnumType(QuoteDurationUnit, {
    name: 'QuoteDurationUnit',
    description: 'The unit a quote’s estimated duration is expressed in (QTE-01).',
  });

  registerEnumType(BookingStatus, {
    name: 'BookingStatus',
    description: 'The escrow lifecycle of a booking (PAY-01, SRS §21.2).',
  });

  // Not a Prisma enum: the reason a search came back empty is derived at read
  // time from the provider probe, never stored. It lives here anyway so the
  // whole GraphQL enum surface is registered in one place.
  registerEnumType(NoProviderReason, {
    name: 'NoProviderReason',
    description:
      'Why a search returned nothing (DIS-06). A code, so the friendly EN/FR copy stays in the web message catalogue.',
  });
}
