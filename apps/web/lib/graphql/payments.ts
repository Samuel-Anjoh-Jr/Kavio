import { gql } from '@apollo/client';
import type { PaymentMethodKind, TransactionStatus, TransactionType } from '@/lib/payments';

/**
 * Wallet, transaction and payment-method READS (DUAL API RULE).
 *
 * These resolvers are delivered by PROMPTS 63-66 in a parallel lane. The wallet
 * UI (PROMPT 67) is built against this contract now and renders a friendly
 * "coming online" state until the resolvers answer — the escrow timeline itself
 * runs on the already-shipped `myBookings` read, so the screen is useful before
 * the wallet backend lands.
 */

export const WALLET_QUERY = gql`
  query Wallet {
    wallet {
      availableBalance
      inEscrow
      currency
      lastTransaction {
        id
        type
        status
        amount
        createdAt
      }
    }
  }
`;

export interface WalletSummary {
  availableBalance: number;
  inEscrow: number;
  currency: string;
  lastTransaction: {
    id: string;
    type: TransactionType;
    status: TransactionStatus;
    amount: number;
    createdAt: string;
  } | null;
}

export interface WalletQueryResult {
  wallet: WalletSummary;
}

/** Transaction history with per-item detail and explicit failure reasons (PAY-05). */
export const TRANSACTIONS_QUERY = gql`
  query Transactions($type: String, $status: String, $limit: Int, $offset: Int) {
    transactions(type: $type, status: $status, limit: $limit, offset: $offset) {
      items {
        id
        type
        status
        amount
        currency
        reference
        counterpartyName
        bookingId
        failureReason
        createdAt
      }
      total
      hasMore
    }
  }
`;

export interface TransactionItem {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;
  reference: string | null;
  counterpartyName: string | null;
  bookingId: string | null;
  /** A localisable code (declined, insufficient_funds, operator_timeout) or null. */
  failureReason: string | null;
  createdAt: string;
}

export interface TransactionsQueryResult {
  transactions: {
    items: TransactionItem[];
    total: number;
    hasMore: boolean;
  };
}

/**
 * The escrow behind one booking (PAY-01, PAY-02).
 *
 * Used by the dispute view to show the exact amount held and frozen. Mirrors
 * apps/api/src/payments/models/payments.model.ts#EscrowView.
 */
export const ESCROW_QUERY = gql`
  query Escrow($bookingId: ID!) {
    escrow(bookingId: $bookingId) {
      id
      bookingId
      state
      amount
      feeAmount
      payoutAmount
      paidAt
      releasedAt
    }
  }
`;

export interface EscrowSummary {
  id: string;
  bookingId: string;
  state: string;
  amount: number;
  feeAmount: number;
  payoutAmount: number;
  paidAt: string;
  releasedAt: string | null;
}

export interface EscrowQueryResult {
  escrow: EscrowSummary | null;
}

export const PAYMENT_METHODS_QUERY = gql`
  query PaymentMethods {
    paymentMethods {
      id
      kind
      label
      maskedAccount
      isDefault
    }
  }
`;

export interface PaymentMethod {
  id: string;
  kind: PaymentMethodKind;
  label: string | null;
  maskedAccount: string | null;
  isDefault: boolean;
}

/**
 * A second, narrower read of the same resolver, used only by the pre-payout
 * confirmation step (MoveMoneyDialog). Kept separate from {@link PaymentMethod}
 * above rather than adding `phone`/`type` there: that shared shape already
 * disagrees with the resolver's real field name (`kind` here should be `type`
 * — see PaymentMethodView in apps/api/src/payments/models/payments.model.ts),
 * a pre-existing mismatch outside this feature's scope to fix. This query
 * spells out the field the resolver actually serves so the confirmation step
 * works regardless of that other bug.
 */
export const DEFAULT_MOMO_METHOD_QUERY = gql`
  query DefaultMomoMethod {
    paymentMethods {
      id
      type
      phone
      isDefault
    }
  }
`;

export interface DefaultMomoMethod {
  id: string;
  type: PaymentMethodKind;
  phone: string | null;
  isDefault: boolean;
}

export interface DefaultMomoMethodQueryResult {
  paymentMethods: DefaultMomoMethod[];
}

export interface PaymentMethodsQueryResult {
  paymentMethods: PaymentMethod[];
}
