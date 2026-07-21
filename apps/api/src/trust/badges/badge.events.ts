import type { BadgeType } from '@trustpro/database';

/** A milestone crossed (TRU-11). Consumed by notifications and, later, the UI. */
export const BADGE_UNLOCKED = 'trust.badge.unlocked';

export class BadgeUnlockedEvent {
  readonly subjectId: string;
  readonly badge: BadgeType;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: {
    subjectId: string;
    badge: BadgeType;
    occurredAt?: Date;
    requestId?: string;
  }) {
    this.subjectId = init.subjectId;
    this.badge = init.badge;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}
