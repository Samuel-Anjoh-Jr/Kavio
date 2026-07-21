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

export const DISPUTE_STATUSES: readonly DisputeStatus[] = ['OPEN', 'ESCALATED', 'RESOLVED'];

export const DISPUTE_STATUS_TONE: Record<DisputeStatus, StatusTone> = {
  OPEN: 'warning',
  ESCALATED: 'danger',
  RESOLVED: 'success',
};

/**
 * A resolution outcome, once an admin has decided (PAY-03, ADM-05). Mirrors the
 * API's DisputeResolution enum — each action drives the escrow machine.
 */
export type DisputeResolution =
  'RELEASE_TO_WORKER' | 'REFUND_TO_CLIENT' | 'REQUEST_INFO' | 'CLOSE_NO_ACTION';

export const DISPUTE_RESOLUTION_TONE: Record<DisputeResolution, StatusTone> = {
  RELEASE_TO_WORKER: 'success',
  REFUND_TO_CLIENT: 'accent',
  REQUEST_INFO: 'warning',
  CLOSE_NO_ACTION: 'neutral',
};

/**
 * The admin's resolution actions (ADM-05), in the order they're offered. Each
 * drives the escrow machine server-side: RELEASE_TO_WORKER releases,
 * REFUND_TO_CLIENT refunds, REQUEST_INFO keeps the hold frozen while asking for
 * more, CLOSE_NO_ACTION resolves without moving money (the parties settled).
 */
export const DISPUTE_RESOLUTIONS: readonly DisputeResolution[] = [
  'RELEASE_TO_WORKER',
  'REFUND_TO_CLIENT',
  'REQUEST_INFO',
  'CLOSE_NO_ACTION',
];

/** Button tone for each resolution action. */
export const DISPUTE_ACTION_VARIANT: Record<
  DisputeResolution,
  'success' | 'accent' | 'outline' | 'ghost'
> = {
  RELEASE_TO_WORKER: 'success',
  REFUND_TO_CLIENT: 'accent',
  REQUEST_INFO: 'outline',
  CLOSE_NO_ACTION: 'ghost',
};

/** Escrow stays frozen while a dispute is unresolved — the assurance the UI shows. */
export function isEscrowFrozen(status: DisputeStatus): boolean {
  return status !== 'RESOLVED';
}
