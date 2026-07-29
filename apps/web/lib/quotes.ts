'use client';

import type { StatusTone } from '@/components/ui/status-badge';

/**
 * Shared quote & booking vocabulary for the web layer (PROMPTS 61, 67).
 *
 * The lifecycles are owned by the API (quote-lifecycle.model.ts, the
 * BookingStatus enum); this is their presentation — wording and tone — kept as
 * data so a "Sent" chip and an "Accepted" chip mean the same thing on every
 * screen that shows a quote.
 */

export type QuoteStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export type QuoteDurationUnit = 'HOUR' | 'DAY' | 'WEEK';

export const QUOTE_DURATION_UNITS: readonly QuoteDurationUnit[] = ['HOUR', 'DAY', 'WEEK'];

export const QUOTE_STATUS_TONE: Record<QuoteStatus, StatusTone> = {
  DRAFT: 'neutral',
  SENT: 'primary',
  VIEWED: 'accent',
  ACCEPTED: 'success',
  DECLINED: 'danger',
  EXPIRED: 'neutral',
};

export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'RELEASED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'DISPUTED';

export const BOOKING_STATUS_TONE: Record<BookingStatus, StatusTone> = {
  PENDING_PAYMENT: 'warning',
  PAID: 'primary',
  ACCEPTED: 'primary',
  IN_PROGRESS: 'accent',
  COMPLETED: 'success',
  RELEASED: 'success',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
  DISPUTED: 'warning',
};

/**
 * The escrow ladder a booking climbs (PAY-02).
 *
 * Money is collected at PAID and released at RELEASED. The rungs match the
 * BookingStatus happy path; the exception states (CANCELLED, REFUNDED, DISPUTED)
 * are branches the timeline calls out rather than rungs it lights.
 */
export const ESCROW_MILESTONES: readonly BookingStatus[] = [
  'PENDING_PAYMENT',
  'PAID',
  'IN_PROGRESS',
  'COMPLETED',
  'RELEASED',
];

export const ESCROW_EXCEPTION_STATUSES: readonly BookingStatus[] = [
  'CANCELLED',
  'REFUNDED',
  'DISPUTED',
];

export function isEscrowException(status: BookingStatus): boolean {
  return ESCROW_EXCEPTION_STATUSES.includes(status);
}

export function escrowMilestoneIndex(status: BookingStatus): number {
  // PENDING_PAYMENT occupies rung 0 for labelling ("Payment — fund the escrow
  // to begin"), but it is the state BEFORE that rung is reached, not after —
  // unlike every other status here, which names something that already
  // happened. Reporting it as reached would check off "Payment" the instant a
  // quote is accepted, before any money has moved.
  if (status === 'PENDING_PAYMENT') return -1;
  // ACCEPTED (the worker acknowledging a funded booking) has no rung of its
  // own on this 5-step ladder — it sits between "Secured in escrow" and "Work
  // in progress" with nothing new to show the client, so it reads as the same
  // reached point as PAID rather than falling through to -1 (indexOf finding
  // nothing) and wrongly looking like payment never happened.
  if (status === 'ACCEPTED') return ESCROW_MILESTONES.indexOf('PAID');
  return ESCROW_MILESTONES.indexOf(status);
}
