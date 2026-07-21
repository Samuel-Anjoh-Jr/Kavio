/**
 * Quote and booking domain events (QTE-01…QTE-03, PAY-01). Emitted by the quote
 * and booking services; the notification adapter and, later, the payments module
 * subscribe. The escrow-initiation event is the seam PROMPTS 62-65 plug into.
 */

export const QUOTE_SENT = 'quote.sent';
export const QUOTE_ACCEPTED = 'quote.accepted';
export const QUOTE_DECLINED = 'quote.declined';
export const QUOTE_COUNTER_REQUESTED = 'quote.counter_requested';

/** Requested the moment a booking is created, for the payments module (PAY-01). */
export const ESCROW_INITIATION_REQUESTED = 'escrow.initiation_requested';

export class QuoteSentEvent {
  readonly quoteId: string;
  readonly jobId: string;
  readonly workerId: string;
  readonly clientId: string;
  readonly price: number;
  readonly requestId?: string;

  constructor(init: {
    quoteId: string;
    jobId: string;
    workerId: string;
    clientId: string;
    price: number;
    requestId?: string;
  }) {
    this.quoteId = init.quoteId;
    this.jobId = init.jobId;
    this.workerId = init.workerId;
    this.clientId = init.clientId;
    this.price = init.price;
    this.requestId = init.requestId;
  }
}

export class QuoteAcceptedEvent {
  readonly quoteId: string;
  readonly jobId: string;
  readonly workerId: string;
  readonly clientId: string;
  readonly bookingId: string;
  readonly price: number;
  readonly requestId?: string;

  constructor(init: {
    quoteId: string;
    jobId: string;
    workerId: string;
    clientId: string;
    bookingId: string;
    price: number;
    requestId?: string;
  }) {
    this.quoteId = init.quoteId;
    this.jobId = init.jobId;
    this.workerId = init.workerId;
    this.clientId = init.clientId;
    this.bookingId = init.bookingId;
    this.price = init.price;
    this.requestId = init.requestId;
  }
}

export class QuoteDeclinedEvent {
  readonly quoteId: string;
  readonly jobId: string;
  readonly workerId: string;
  readonly requestId?: string;

  constructor(init: { quoteId: string; jobId: string; workerId: string; requestId?: string }) {
    this.quoteId = init.quoteId;
    this.jobId = init.jobId;
    this.workerId = init.workerId;
    this.requestId = init.requestId;
  }
}

export class QuoteCounterRequestedEvent {
  readonly quoteId: string;
  readonly jobId: string;
  readonly workerId: string;
  readonly targetPrice: number | null;
  readonly message: string | null;
  readonly requestId?: string;

  constructor(init: {
    quoteId: string;
    jobId: string;
    workerId: string;
    targetPrice?: number | null;
    message?: string | null;
    requestId?: string;
  }) {
    this.quoteId = init.quoteId;
    this.jobId = init.jobId;
    this.workerId = init.workerId;
    this.targetPrice = init.targetPrice ?? null;
    this.message = init.message ?? null;
    this.requestId = init.requestId;
  }
}

/**
 * Escrow initiation (PAY-01). The booking exists and money must now be collected
 * into escrow at `agreedPrice`. PROMPT 55-60 stops here — emitting the fact; the
 * Campay collection, the hold and the state transitions are PROMPTS 62-65.
 */
export class EscrowInitiationRequestedEvent {
  readonly bookingId: string;
  readonly jobId: string;
  readonly quoteId: string;
  readonly clientId: string;
  readonly workerId: string;
  readonly agreedPrice: number;
  readonly platformFeeAmount: number;
  readonly workerPayoutAmount: number;
  readonly requestId?: string;

  constructor(init: {
    bookingId: string;
    jobId: string;
    quoteId: string;
    clientId: string;
    workerId: string;
    agreedPrice: number;
    platformFeeAmount: number;
    workerPayoutAmount: number;
    requestId?: string;
  }) {
    this.bookingId = init.bookingId;
    this.jobId = init.jobId;
    this.quoteId = init.quoteId;
    this.clientId = init.clientId;
    this.workerId = init.workerId;
    this.agreedPrice = init.agreedPrice;
    this.platformFeeAmount = init.platformFeeAmount;
    this.workerPayoutAmount = init.workerPayoutAmount;
    this.requestId = init.requestId;
  }
}
