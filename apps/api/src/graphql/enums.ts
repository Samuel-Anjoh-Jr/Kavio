import { registerEnumType } from '@nestjs/graphql';
import { NoProviderReason } from '../search/no-provider.util';
import { VerificationQueueGroupEnum } from '../verification/verification.model';
import {
  AbuseReportReason,
  AbuseReportStatus,
  AgentInvitationStatus,
  AnnouncementAudience,
  AnnouncementStatus,
  BadgeType,
  BookingStatus,
  DisputeFaultParty,
  DisputeResolution,
  DisputeStatus,
  EndorsementRelationship,
  EscrowState,
  FeaturedListingStatus,
  GeoRegionLevel,
  JobApplicationStatus,
  JobInvitationStatus,
  JobStatus,
  JobUrgency,
  LocationSource,
  MediaAssetKind,
  MediaVisibility,
  MessageKind,
  MessageStatus,
  ModerationActionType,
  NotificationCategory,
  NotificationChannel,
  OnboardingRole,
  PaymentMethodType,
  PortfolioItemType,
  PortfolioSlot,
  QuoteDurationUnit,
  QuoteStatus,
  ReportTargetType,
  Role,
  SOSStatus,
  TeamMemberAccessLevel,
  TeamMemberRole,
  TeamMemberStatus,
  TrackingSessionStatus,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
  TrustEventType,
  TrustPillar,
  UserStatus,
  VerificationCheckType,
  VerificationRejectionReason,
  VerificationStage,
  VerificationStatus,
  VerificationTier,
} from '@kavio/database';

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

  registerEnumType(TeamMemberAccessLevel, {
    name: 'TeamMemberAccessLevel',
    description:
      'What a team member may do, enforced server-side on every business write (BIZ-03). Distinct from their role, which is an HR label — renaming a job title must never change what somebody can spend.',
  });

  registerEnumType(TeamMemberStatus, {
    name: 'TeamMemberStatus',
    description:
      'A team seat’s state (BIZ-03). Only ACTIVE confers access: an invitation that was sent, declined or removed grants nothing.',
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

  registerEnumType(PaymentMethodType, {
    name: 'PaymentMethodType',
    description: 'A payment rail Campay exposes (PAY-04): MTN/Orange Mobile Money, card, bank.',
  });

  registerEnumType(TransactionType, {
    name: 'TransactionType',
    description:
      'What a ledger row represents (PAY-05): deposit, payment, escrow hold/release, fee, refund, withdrawal.',
  });

  registerEnumType(TransactionStatus, {
    name: 'TransactionStatus',
    description: 'Where a transaction is in its life (PAY-06): pending, success, failed, reversed.',
  });

  registerEnumType(TransactionDirection, {
    name: 'TransactionDirection',
    description: 'Money in or out from the wallet owner’s point of view (PAY-05).',
  });

  registerEnumType(EscrowState, {
    name: 'EscrowState',
    description: 'The escrow money machine (SRS §15.1, PAY-01, PAY-02).',
  });

  registerEnumType(DisputeStatus, {
    name: 'DisputeStatus',
    description: 'A dispute’s lifecycle (PAY-03, ADM-05): open, escalated, resolved.',
  });

  registerEnumType(DisputeResolution, {
    name: 'DisputeResolution',
    description: 'How an admin resolved a dispute (ADM-05).',
  });

  registerEnumType(DisputeFaultParty, {
    name: 'DisputeFaultParty',
    description:
      'Which party the resolving admin found at fault (ADM-05). Separate from the resolution, because the direction the money went does not settle who behaved badly — a client who escalates in good faith and loses has done nothing wrong. NONE is the common case and carries no trust penalty.',
  });

  registerEnumType(MessageKind, {
    name: 'MessageKind',
    description: 'What a message is, which is how the client renders it (MSG-01).',
  });

  registerEnumType(MessageStatus, {
    name: 'MessageStatus',
    description: 'The sender-facing delivery tick (MSG-02): sent, delivered, read.',
  });

  registerEnumType(SOSStatus, {
    name: 'SOSStatus',
    description: 'A safety alert’s state (SOS-03): active, resolved, false alarm.',
  });

  registerEnumType(TrackingSessionStatus, {
    name: 'TrackingSessionStatus',
    description: 'A live-tracking session’s state (SOS-03): active or ended.',
  });

  registerEnumType(NotificationCategory, {
    name: 'NotificationCategory',
    description:
      'The preference category a notification belongs to (SRS §26.1). Typed, never free-text, so the channel × category grid is exhaustive.',
  });

  registerEnumType(NotificationChannel, {
    name: 'NotificationChannel',
    description:
      'A delivery channel (SRS §17). IN_APP is the Notification Center itself; SMS is wired but switched off at launch.',
  });

  registerEnumType(ReportTargetType, {
    name: 'ReportTargetType',
    description:
      'What a report points at (ADM-08). With the target id it forms the grouping key of the moderation workspace.',
  });

  registerEnumType(AbuseReportReason, {
    name: 'AbuseReportReason',
    description:
      'Why something was reported (MSG-04, ADM-08). A code, so the EN/FR copy stays in the web message catalogue.',
  });

  registerEnumType(AbuseReportStatus, {
    name: 'AbuseReportStatus',
    description: 'Where a report is in review (ADM-08): open, reviewing, actioned, dismissed.',
  });

  registerEnumType(ModerationActionType, {
    name: 'ModerationActionType',
    description: 'What an admin decided about a reported item or party (ADM-08).',
  });

  registerEnumType(AgentInvitationStatus, {
    name: 'AgentInvitationStatus',
    description:
      'Where an agent invitation stands (ADM-06). REVOKED is the admin withdrawing it; EXPIRED is the clock running out — different answers to "why can’t this person sign up", with different remedies.',
  });

  registerEnumType(AnnouncementAudience, {
    name: 'AnnouncementAudience',
    description:
      'Who an announcement targets (ADM-07). Targeted by ROLE, never by a saved recipient list, which would be stale before it was sent.',
  });

  registerEnumType(AnnouncementStatus, {
    name: 'AnnouncementStatus',
    description: 'Draft, published or archived (ADM-07).',
  });

  registerEnumType(FeaturedListingStatus, {
    name: 'FeaturedListingStatus',
    description:
      'A sponsored ranking placement’s lifecycle (business plan: "Featured/Verified Business tier"). Held on the identity, like tier and Trust Score.',
  });

  // Not a Prisma enum: the reason a search came back empty is derived at read
  // time from the provider probe, never stored. It lives here anyway so the
  // whole GraphQL enum surface is registered in one place.
  registerEnumType(NoProviderReason, {
    name: 'NoProviderReason',
    description:
      'Why a search returned nothing (DIS-06). A code, so the friendly EN/FR copy stays in the web message catalogue.',
  });

  // Also not a Prisma enum: the verification queue's tabs are a product grouping
  // over check types (ADM-03), not a stored column. `verificationQueue(group:)`
  // references it as an @Args type, so it must be registered here or the schema
  // build fails at bootstrap with "cannot determine a GraphQL input type".
  registerEnumType(VerificationQueueGroupEnum, {
    name: 'VerificationQueueGroup',
    description:
      'A tab of the admin verification queue (ADM-03): ALL, or the group of check types behind ID, BUSINESS or FIELD.',
  });
}
