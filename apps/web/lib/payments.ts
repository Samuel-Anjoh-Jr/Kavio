'use client';

import type { StatusTone } from '@/components/ui/status-badge';

/**
 * Shared payments vocabulary for the web layer (PROMPT 67).
 *
 * The wallet, transaction and escrow backends land in PROMPTS 62-66 (a parallel
 * lane). This module is the client-side contract and presentation for what those
 * reads return, so the wallet UI is built and reviewable against a stable shape
 * and simply lights up when the resolvers arrive.
 */

export type TransactionType =
  'PAYMENT' | 'ESCROW_HOLD' | 'ESCROW_RELEASE' | 'REFUND' | 'WITHDRAWAL' | 'FEE';

export const TRANSACTION_TYPES: readonly TransactionType[] = [
  'PAYMENT',
  'ESCROW_HOLD',
  'ESCROW_RELEASE',
  'REFUND',
  'WITHDRAWAL',
  'FEE',
];

export type TransactionStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED';

export const TRANSACTION_STATUS_TONE: Record<TransactionStatus, StatusTone> = {
  PENDING: 'warning',
  SUCCESSFUL: 'success',
  FAILED: 'danger',
};

/**
 * Whether a transaction adds to or removes from the wallet, for the +/- sign
 * and colour. Escrow holds and fees leave the wallet; releases and refunds
 * arrive. A withdrawal leaves.
 */
export function isCredit(type: TransactionType): boolean {
  return type === 'ESCROW_RELEASE' || type === 'REFUND' || type === 'PAYMENT';
}

/** Campay mobile-money operators, XAF collection + payout (PAY-04). */
export type PaymentMethodKind = 'MTN_MOMO' | 'ORANGE_MONEY' | 'CARD' | 'BANK';

export const PAYMENT_METHOD_KINDS: readonly PaymentMethodKind[] = [
  'MTN_MOMO',
  'ORANGE_MONEY',
  'CARD',
  'BANK',
];

/**
 * The ~10% platform fee, shown BEFORE payment (PAY-02, §15.1).
 *
 * The authoritative fee is snapshotted server-side onto the booking at
 * acceptance (booking-fee.model.ts); this mirror lets the accept screen show
 * the split a beat before the booking exists, so the number is never a surprise
 * at the moment money moves. Whole XAF — no minor unit.
 */
export const PLATFORM_FEE_RATE = 0.1;

export interface FeeBreakdown {
  price: number;
  fee: number;
  workerPayout: number;
}

export function estimateFee(price: number): FeeBreakdown {
  const fee = Math.round(price * PLATFORM_FEE_RATE);
  return { price, fee, workerPayout: price - fee };
}
