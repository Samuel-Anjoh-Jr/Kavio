/**
 * Payment & escrow domain events (PAY-01…PAY-06, ADM-05). Emitted by the payments
 * services; the notification adapter subscribes. Controllers/services EMIT — they
 * never call a provider — per the dispatcher pattern (SRS §17).
 */

export const PAYMENT_RECEIVED = 'payment.received';
export const ESCROW_RELEASED = 'escrow.released';
export const ESCROW_REFUNDED = 'escrow.refunded';
export const PAYMENT_FAILED = 'payment.failed';
export const DISPUTE_OPENED = 'dispute.opened';
export const DISPUTE_RESOLVED = 'dispute.resolved';

export class PaymentReceivedEvent {
  readonly bookingId: string;
  readonly jobId: string;
  readonly clientId: string;
  readonly workerId: string;
  readonly amount: number;
  readonly requestId?: string;

  constructor(init: {
    bookingId: string;
    jobId: string;
    clientId: string;
    workerId: string;
    amount: number;
    requestId?: string;
  }) {
    this.bookingId = init.bookingId;
    this.jobId = init.jobId;
    this.clientId = init.clientId;
    this.workerId = init.workerId;
    this.amount = init.amount;
    this.requestId = init.requestId;
  }
}

export class EscrowReleasedEvent {
  readonly bookingId: string;
  readonly jobId: string;
  readonly workerId: string;
  readonly clientId: string;
  readonly payoutAmount: number;
  readonly feeAmount: number;
  readonly requestId?: string;

  constructor(init: {
    bookingId: string;
    jobId: string;
    workerId: string;
    clientId: string;
    payoutAmount: number;
    feeAmount: number;
    requestId?: string;
  }) {
    this.bookingId = init.bookingId;
    this.jobId = init.jobId;
    this.workerId = init.workerId;
    this.clientId = init.clientId;
    this.payoutAmount = init.payoutAmount;
    this.feeAmount = init.feeAmount;
    this.requestId = init.requestId;
  }
}

export class EscrowRefundedEvent {
  readonly bookingId: string;
  readonly jobId: string;
  readonly clientId: string;
  readonly workerId: string;
  readonly amount: number;
  readonly requestId?: string;

  constructor(init: {
    bookingId: string;
    jobId: string;
    clientId: string;
    workerId: string;
    amount: number;
    requestId?: string;
  }) {
    this.bookingId = init.bookingId;
    this.jobId = init.jobId;
    this.clientId = init.clientId;
    this.workerId = init.workerId;
    this.amount = init.amount;
    this.requestId = init.requestId;
  }
}

export class PaymentFailedEvent {
  readonly userId: string;
  readonly bookingId: string | null;
  readonly amount: number;
  /** Coded reason for the localized plain-language copy (PAY-06). */
  readonly reasonKey: string;
  readonly requestId?: string;

  constructor(init: {
    userId: string;
    bookingId?: string | null;
    amount: number;
    reasonKey: string;
    requestId?: string;
  }) {
    this.userId = init.userId;
    this.bookingId = init.bookingId ?? null;
    this.amount = init.amount;
    this.reasonKey = init.reasonKey;
    this.requestId = init.requestId;
  }
}

export class DisputeOpenedEvent {
  readonly disputeId: string;
  readonly bookingId: string;
  readonly jobId: string;
  readonly openedById: string;
  /** The party who did NOT open it — the one to notify. */
  readonly otherPartyId: string;
  readonly requestId?: string;

  constructor(init: {
    disputeId: string;
    bookingId: string;
    jobId: string;
    openedById: string;
    otherPartyId: string;
    requestId?: string;
  }) {
    this.disputeId = init.disputeId;
    this.bookingId = init.bookingId;
    this.jobId = init.jobId;
    this.openedById = init.openedById;
    this.otherPartyId = init.otherPartyId;
    this.requestId = init.requestId;
  }
}

export class DisputeResolvedEvent {
  readonly disputeId: string;
  readonly bookingId: string;
  readonly jobId: string;
  readonly clientId: string;
  readonly workerId: string;
  /** The resolution enum value, keyed to localized copy in the web catalogue. */
  readonly resolution: string;
  readonly requestId?: string;

  constructor(init: {
    disputeId: string;
    bookingId: string;
    jobId: string;
    clientId: string;
    workerId: string;
    resolution: string;
    requestId?: string;
  }) {
    this.disputeId = init.disputeId;
    this.bookingId = init.bookingId;
    this.jobId = init.jobId;
    this.clientId = init.clientId;
    this.workerId = init.workerId;
    this.resolution = init.resolution;
    this.requestId = init.requestId;
  }
}
