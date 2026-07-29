import type { Role } from '@kavio/database';

/**
 * Identity domain events (ACC-04, ACC-05).
 *
 * Auth EMITS facts about an identity and knows nothing about who cares. The
 * Trust Engine subscribes to grant the starting score and to settle the phone
 * check; notifications subscribe elsewhere. Neither concern is allowed to reach
 * back into auth, which is what keeps the module dependency-free in that
 * direction — the same discipline the notification dispatcher already follows.
 */

export const IDENTITY_CREATED = 'identity.created';
export const IDENTITY_PHONE_VERIFIED = 'identity.phone_verified';

/** A new identity exists. Carries the SRS §21.5 starting score into the ledger. */
export class IdentityCreatedEvent {
  readonly userId: string;
  readonly role: Role;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: { userId: string; role: Role; occurredAt?: Date; requestId?: string }) {
    this.userId = init.userId;
    this.role = init.role;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}

/** A phone number was proved by OTP — the first progressive check (TRU-06). */
export class IdentityPhoneVerifiedEvent {
  readonly userId: string;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: { userId: string; occurredAt?: Date; requestId?: string }) {
    this.userId = init.userId;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}
