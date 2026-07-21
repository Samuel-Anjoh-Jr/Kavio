'use client';

import type { StatusTone } from '@/components/ui/status-badge';

/**
 * Shared dispute vocabulary for the web layer (PROMPT 69).
 *
 * The disputes backend is PROMPT 68 (a parallel lane): opening a dispute freezes
 * the associated escrow until an admin resolves it. This module is the
 * client-side contract and presentation for the parties' dispute view.
 */

export type DisputeStatus = 'OPEN' | 'ESCALATED' | 'RESOLVED';

export const DISPUTE_STATUS_TONE: Record<DisputeStatus, StatusTone> = {
  OPEN: 'warning',
  ESCALATED: 'danger',
  RESOLVED: 'success',
};

/** A resolution outcome, once an admin has decided (PAY-03). */
export type DisputeResolution = 'RELEASED' | 'REFUNDED' | 'PARTIAL' | 'CLOSED';

export const DISPUTE_RESOLUTION_TONE: Record<DisputeResolution, StatusTone> = {
  RELEASED: 'success',
  REFUNDED: 'accent',
  PARTIAL: 'primary',
  CLOSED: 'neutral',
};

/** Escrow stays frozen while a dispute is unresolved — the assurance the UI shows. */
export function isEscrowFrozen(status: DisputeStatus): boolean {
  return status !== 'RESOLVED';
}
