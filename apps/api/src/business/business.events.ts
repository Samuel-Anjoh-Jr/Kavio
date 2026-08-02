/**
 * Business & team domain events (BIZ-01, BIZ-03). Emitted by the business
 * services; the notification adapter subscribes. Services EMIT — they never call
 * a provider — per the dispatcher pattern (SRS §17).
 */

export const TEAM_INVITATION_SENT = 'business.team.invitation_sent';
export const TEAM_MEMBER_JOINED = 'business.team.member_joined';
export const TEAM_MEMBER_REMOVED = 'business.team.member_removed';
export const BUSINESS_VERIFIED = 'business.verified';

/**
 * A team invitation was issued (BIZ-03).
 *
 * Carries the RAW token, because the invitation email is the one place it is
 * ever needed and this event is how it gets there. That is also why it carries
 * nothing else sensitive: the event crosses a process boundary into the
 * dispatcher, and the less that travels with it the better.
 */
export class TeamInvitationSentEvent {
  readonly memberId: string;
  readonly businessProfileId: string;
  readonly businessName: string;
  readonly invitedById: string;
  readonly name: string;
  readonly email: string | null;
  readonly token: string;
  readonly expiresAt: Date;
  readonly requestId?: string;

  constructor(init: {
    memberId: string;
    businessProfileId: string;
    businessName: string;
    invitedById: string;
    name: string;
    email: string | null;
    token: string;
    expiresAt: Date;
    requestId?: string;
  }) {
    this.memberId = init.memberId;
    this.businessProfileId = init.businessProfileId;
    this.businessName = init.businessName;
    this.invitedById = init.invitedById;
    this.name = init.name;
    this.email = init.email;
    this.token = init.token;
    this.expiresAt = init.expiresAt;
    this.requestId = init.requestId;
  }
}

export class TeamMemberJoinedEvent {
  readonly memberId: string;
  readonly businessProfileId: string;
  readonly userId: string;
  readonly requestId?: string;

  constructor(init: {
    memberId: string;
    businessProfileId: string;
    userId: string;
    requestId?: string;
  }) {
    this.memberId = init.memberId;
    this.businessProfileId = init.businessProfileId;
    this.userId = init.userId;
    this.requestId = init.requestId;
  }
}

export class TeamMemberRemovedEvent {
  readonly memberId: string;
  readonly businessProfileId: string;
  /** Null when the seat was still a pending invitation with no identity bound. */
  readonly userId: string | null;
  readonly removedById: string;
  readonly requestId?: string;

  constructor(init: {
    memberId: string;
    businessProfileId: string;
    userId: string | null;
    removedById: string;
    requestId?: string;
  }) {
    this.memberId = init.memberId;
    this.businessProfileId = init.businessProfileId;
    this.userId = init.userId;
    this.removedById = init.removedById;
    this.requestId = init.requestId;
  }
}

/** RCCM registration approved: the Verified Business badge is earned (BIZ-01). */
export class BusinessVerifiedEvent {
  readonly businessProfileId: string;
  readonly ownerId: string;
  /** Null mirrors the verification event: a system-driven approval has no human. */
  readonly reviewerId: string | null;
  readonly requestId?: string;

  constructor(init: {
    businessProfileId: string;
    ownerId: string;
    reviewerId: string | null;
    requestId?: string;
  }) {
    this.businessProfileId = init.businessProfileId;
    this.ownerId = init.ownerId;
    this.reviewerId = init.reviewerId;
    this.requestId = init.requestId;
  }
}
