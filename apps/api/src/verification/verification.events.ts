import type {
  VerificationCheckType,
  VerificationRejectionReason,
  VerificationStage,
} from '@kavio/database';

/**
 * Verification domain events (TRU-06, TRU-07, AGT-03).
 *
 * The pipeline ANNOUNCES outcomes and knows nothing about who reacts. Badges,
 * notifications and (later) the agent dashboard subscribe independently, which
 * is why approving an ID does not require the review code to know that a badge
 * exists.
 */

export const VERIFICATION_SUBMITTED = 'verification.submitted';
export const VERIFICATION_APPROVED = 'verification.approved';
export const VERIFICATION_REJECTED = 'verification.rejected';
export const VERIFICATION_INFO_REQUESTED = 'verification.info_requested';
export const VERIFICATION_FIELD_VERIFIED = 'verification.field_verified';

interface VerificationEventBase {
  readonly recordId: string;
  readonly subjectId: string;
  readonly checkType: VerificationCheckType;
  readonly requestId?: string;
}

export class VerificationSubmittedEvent implements VerificationEventBase {
  readonly recordId: string;
  readonly subjectId: string;
  readonly checkType: VerificationCheckType;
  readonly attempt: number;
  readonly stage: VerificationStage;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: {
    recordId: string;
    subjectId: string;
    checkType: VerificationCheckType;
    attempt: number;
    stage: VerificationStage;
    occurredAt?: Date;
    requestId?: string;
  }) {
    this.recordId = init.recordId;
    this.subjectId = init.subjectId;
    this.checkType = init.checkType;
    this.attempt = init.attempt;
    this.stage = init.stage;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}

export class VerificationApprovedEvent implements VerificationEventBase {
  readonly recordId: string;
  readonly subjectId: string;
  readonly checkType: VerificationCheckType;
  /** Null for checks settled automatically (phone OTP, portfolio upload). */
  readonly reviewerId: string | null;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: {
    recordId: string;
    subjectId: string;
    checkType: VerificationCheckType;
    reviewerId?: string | null;
    occurredAt?: Date;
    requestId?: string;
  }) {
    this.recordId = init.recordId;
    this.subjectId = init.subjectId;
    this.checkType = init.checkType;
    this.reviewerId = init.reviewerId ?? null;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}

/**
 * A refused attempt. Carries the reason CODE, never a sentence — the friendly
 * retry copy is localized EN/FR in the web catalogue (TRU-07).
 */
export class VerificationRejectedEvent implements VerificationEventBase {
  readonly recordId: string;
  readonly subjectId: string;
  readonly checkType: VerificationCheckType;
  readonly reason: VerificationRejectionReason;
  readonly retryable: boolean;
  readonly attempt: number;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: {
    recordId: string;
    subjectId: string;
    checkType: VerificationCheckType;
    reason: VerificationRejectionReason;
    retryable: boolean;
    attempt: number;
    occurredAt?: Date;
    requestId?: string;
  }) {
    this.recordId = init.recordId;
    this.subjectId = init.subjectId;
    this.checkType = init.checkType;
    this.reason = init.reason;
    this.retryable = init.retryable;
    this.attempt = init.attempt;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}

export class VerificationInfoRequestedEvent implements VerificationEventBase {
  readonly recordId: string;
  readonly subjectId: string;
  readonly checkType: VerificationCheckType;
  readonly infoRequest: string;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: {
    recordId: string;
    subjectId: string;
    checkType: VerificationCheckType;
    infoRequest: string;
    occurredAt?: Date;
    requestId?: string;
  }) {
    this.recordId = init.recordId;
    this.subjectId = init.subjectId;
    this.checkType = init.checkType;
    this.infoRequest = init.infoRequest;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}

/** A worker verified in person by a Field Agent (TRU-09, AGT-01). */
export class FieldVerificationCompletedEvent {
  readonly subjectId: string;
  readonly agentId: string;
  readonly recordId: string;
  /** True when this intake created the account, rather than badging an existing one. */
  readonly createdAccount: boolean;
  readonly occurredAt: Date;
  readonly requestId?: string;

  constructor(init: {
    subjectId: string;
    agentId: string;
    recordId: string;
    createdAccount: boolean;
    occurredAt?: Date;
    requestId?: string;
  }) {
    this.subjectId = init.subjectId;
    this.agentId = init.agentId;
    this.recordId = init.recordId;
    this.createdAccount = init.createdAccount;
    this.occurredAt = init.occurredAt ?? new Date();
    this.requestId = init.requestId;
  }
}
