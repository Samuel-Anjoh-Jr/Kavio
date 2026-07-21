/**
 * Typed Campay contracts (PAY-04, PAY-06). Webhook payloads and API responses are
 * fully typed interfaces validated before use — never `any` (SRS §24 "Webhook
 * payloads are fully typed interfaces validated before processing").
 */

/** Campay's own transaction outcome vocabulary. Normalised to our enums on the way in. */
export type CampayStatus = 'SUCCESSFUL' | 'FAILED' | 'PENDING';

/** A request to collect money from a payer's Mobile Money line. */
export interface CampayCollectRequest {
  /** Whole XAF as a string, per Campay's API. */
  amount: string;
  currency: 'XAF';
  /** E.164 without the plus, e.g. "237670000000". */
  from: string;
  description: string;
  /** OUR idempotency key, echoed back on the webhook as `external_reference`. */
  external_reference: string;
}

/** A request to pay money out to a recipient's Mobile Money line. */
export interface CampayWithdrawRequest {
  amount: string;
  currency: 'XAF';
  to: string;
  description: string;
  external_reference: string;
}

/** The reference Campay returns when it accepts a collection/withdrawal for processing. */
export interface CampayReferenceResponse {
  reference: string;
  /** USSD prompt code the payer may need to dial (collection only). */
  ussd_code?: string;
  operator?: string;
}

/** The full status of a transaction, from GET /transaction/{ref}/ or a webhook. */
export interface CampayTransactionStatus {
  reference: string;
  external_reference: string;
  status: CampayStatus;
  amount: string;
  currency: string;
  operator?: string;
  /** Operator result code, present on completion. */
  code?: string;
  operator_reference?: string;
  /** Failure detail from the operator, mapped to a coded reason for the user. */
  reason?: string;
}

/**
 * The signed webhook Campay POSTs on collection/payout completion (PAY-06). The
 * `signature` is a JWT signed with the application's webhook key; every field is
 * verified before the payload is trusted.
 */
export interface CampayWebhookPayload {
  reference: string;
  external_reference: string;
  status: CampayStatus;
  amount: string;
  currency: string;
  operator?: string;
  code?: string;
  operator_reference?: string;
  endpoint?: string;
  signature: string;
  reason?: string;
}

/** Normalised outcome the payments module works with, independent of Campay wording. */
export type SettlementOutcome = 'SUCCESS' | 'FAILED' | 'PENDING';

export function normaliseCampayStatus(status: string): SettlementOutcome {
  switch (status) {
    case 'SUCCESSFUL':
      return 'SUCCESS';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}
