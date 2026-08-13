/**
 * Featured/sponsored-listing domain events (business plan: "Featured/Verified
 * Business tier").
 *
 * The review pipeline ANNOUNCES outcomes and knows nothing about who reacts.
 * Notifications subscribe independently, which is why approving a listing does
 * not require the review code to know a notification template exists.
 */

export const FEATURED_REQUESTED = 'featured.requested';
export const FEATURED_APPROVED = 'featured.approved';
export const FEATURED_REJECTED = 'featured.rejected';
export const FEATURED_REVOKED = 'featured.revoked';

interface FeaturedEventBase {
  readonly userId: string;
  readonly requestId?: string;
}

export class FeaturedRequestedEvent implements FeaturedEventBase {
  readonly userId: string;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: { userId: string; occurredAt?: Date; requestId?: string }) {
    this.userId = init.userId;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}

export class FeaturedApprovedEvent implements FeaturedEventBase {
  readonly userId: string;
  readonly reviewerId: string;
  readonly extraCommissionBps: number;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: {
    userId: string;
    reviewerId: string;
    extraCommissionBps: number;
    occurredAt?: Date;
    requestId?: string;
  }) {
    this.userId = init.userId;
    this.reviewerId = init.reviewerId;
    this.extraCommissionBps = init.extraCommissionBps;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}

export class FeaturedRejectedEvent implements FeaturedEventBase {
  readonly userId: string;
  readonly reviewerId: string;
  readonly reason: string;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: {
    userId: string;
    reviewerId: string;
    reason: string;
    occurredAt?: Date;
    requestId?: string;
  }) {
    this.userId = init.userId;
    this.reviewerId = init.reviewerId;
    this.reason = init.reason;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}

export class FeaturedRevokedEvent implements FeaturedEventBase {
  readonly userId: string;
  readonly reviewerId: string;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: { userId: string; reviewerId: string; occurredAt?: Date; requestId?: string }) {
    this.userId = init.userId;
    this.reviewerId = init.reviewerId;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}
