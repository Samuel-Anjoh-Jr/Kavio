/**
 * Admin domain events (ADM-06, ADM-07). Emitted by the admin services; the
 * notification adapter subscribes. Services EMIT — they never call a provider —
 * per the dispatcher pattern (SRS §17).
 */

export const AGENT_INVITATION_SENT = 'admin.agent_invitation.sent';
export const ANNOUNCEMENT_PUBLISHED = 'admin.announcement.published';

/**
 * An agent invitation was issued (ADM-06).
 *
 * Carries the RAW token, because the invitation email is the one place it is
 * ever needed and this event is how it gets there. Nothing else sensitive
 * travels with it: the event crosses into the dispatcher, and the smaller the
 * payload the smaller the surface.
 */
export class AgentInvitationSentEvent {
  readonly invitationId: string;
  readonly invitedById: string;
  readonly name: string;
  readonly email: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly requestId?: string;

  constructor(init: {
    invitationId: string;
    invitedById: string;
    name: string;
    email: string;
    token: string;
    expiresAt: Date;
    requestId?: string;
  }) {
    this.invitationId = init.invitationId;
    this.invitedById = init.invitedById;
    this.name = init.name;
    this.email = init.email;
    this.token = init.token;
    this.expiresAt = init.expiresAt;
    this.requestId = init.requestId;
  }
}

/**
 * An announcement went live (ADM-07).
 *
 * Carries the audience, not a recipient list. Who is in "all workers" is a
 * question for the dispatcher at delivery time — a list materialised here would
 * be stale before it was sent, and would silently exclude everyone who joined in
 * between.
 */
export class AnnouncementPublishedEvent {
  readonly announcementId: string;
  readonly audience: string;
  readonly titleEn: string;
  readonly titleFr: string;
  readonly requestId?: string;

  constructor(init: {
    announcementId: string;
    audience: string;
    titleEn: string;
    titleFr: string;
    requestId?: string;
  }) {
    this.announcementId = init.announcementId;
    this.audience = init.audience;
    this.titleEn = init.titleEn;
    this.titleFr = init.titleFr;
    this.requestId = init.requestId;
  }
}
