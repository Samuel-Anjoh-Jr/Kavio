import { BookingStatus, EscrowState, JobStatus } from '@kavio/database';

/**
 * The escrow money machine as a PURE state machine (PAY-01, PAY-02, SRS §15.1).
 *
 * The transition table is the single source of truth for which money moves are
 * legal. It lives here, as data, with no database or Campay call in sight, so it
 * can be exhaustively tested and every path that moves an escrow asks the same
 * question the same way. An escrow `state` any code could set to any value is not
 * a state machine — it is the bug that pays a worker twice.
 *
 * The table reproduces SRS §15.1 exactly, with the two refund exits the job
 * lifecycle also draws (cancel before work):
 *
 *   Paid        → Accepted (worker), Refunded (system: cancel before acceptance)
 *   Accepted    → In Progress (worker), Refunded (system: cancel before work)
 *   In Progress → Completed (worker), Disputed (either)
 *   Completed   → Released (client confirms), Disputed (either)
 *   Disputed    → Released (admin for worker), Refunded (admin for client)
 *   Released / Refunded → terminal
 *
 * DISPUTED is the freeze (PAY-03): its only exits are SYSTEM (admin) moves, so a
 * party cannot start, complete or confirm their way out of a disputed hold — the
 * funds are stuck until an admin resolves, which is the whole point.
 */

/** Who is expected to drive an escrow transition. The service authorises against this. */
export type EscrowActor =
  /** The client who funded the escrow. */
  | 'CLIENT'
  /** The worker being paid. */
  | 'WORKER'
  /** Either party (a dispute can be raised by either side). */
  | 'EITHER'
  /** The platform: Campay webhooks, admin dispute resolution, cancellation refunds. */
  | 'SYSTEM';

interface EscrowTransitionRule {
  readonly to: EscrowState;
  readonly actor: EscrowActor;
}

export const ESCROW_TRANSITIONS: Readonly<Record<EscrowState, readonly EscrowTransitionRule[]>> = {
  [EscrowState.PAID]: [
    { to: EscrowState.ACCEPTED, actor: 'WORKER' },
    { to: EscrowState.REFUNDED, actor: 'SYSTEM' },
  ],
  [EscrowState.ACCEPTED]: [
    { to: EscrowState.IN_PROGRESS, actor: 'WORKER' },
    { to: EscrowState.REFUNDED, actor: 'SYSTEM' },
  ],
  [EscrowState.IN_PROGRESS]: [
    { to: EscrowState.COMPLETED, actor: 'WORKER' },
    { to: EscrowState.DISPUTED, actor: 'EITHER' },
  ],
  [EscrowState.COMPLETED]: [
    // The client confirming completion is what releases the payout (PAY-01).
    { to: EscrowState.RELEASED, actor: 'CLIENT' },
    { to: EscrowState.DISPUTED, actor: 'EITHER' },
  ],
  [EscrowState.DISPUTED]: [
    // Admin resolution, one way or the other (§15.1). SYSTEM-only: the freeze.
    { to: EscrowState.RELEASED, actor: 'SYSTEM' },
    { to: EscrowState.REFUNDED, actor: 'SYSTEM' },
  ],
  [EscrowState.RELEASED]: [],
  [EscrowState.REFUNDED]: [],
};

/** States an escrow can never leave — money has settled. */
export const TERMINAL_ESCROW_STATES: readonly EscrowState[] = (
  Object.keys(ESCROW_TRANSITIONS) as EscrowState[]
).filter((state) => ESCROW_TRANSITIONS[state].length === 0);

export function isTerminalEscrowState(state: EscrowState): boolean {
  return ESCROW_TRANSITIONS[state].length === 0;
}

/** Whether `from → to` is a legal move at all, ignoring who is asking. */
export function canTransitionEscrow(from: EscrowState, to: EscrowState): boolean {
  return ESCROW_TRANSITIONS[from].some((rule) => rule.to === to);
}

export function escrowTransitionRule(
  from: EscrowState,
  to: EscrowState,
): EscrowTransitionRule | null {
  return ESCROW_TRANSITIONS[from].find((rule) => rule.to === to) ?? null;
}

/**
 * Whether an actor in `actorRole` may make the `from → to` move.
 *
 * SYSTEM moves are reachable only from a SYSTEM caller — a client cannot declare
 * their own escrow refunded, and neither party can move a DISPUTED hold. A CLIENT-
 * or WORKER-specific move is reachable by that party or by SYSTEM acting for them.
 */
export function isEscrowTransitionAllowedFor(
  from: EscrowState,
  to: EscrowState,
  actorRole: EscrowActor,
): boolean {
  const rule = escrowTransitionRule(from, to);
  if (!rule) {
    return false;
  }
  if (rule.actor === 'SYSTEM') {
    return actorRole === 'SYSTEM';
  }
  if (rule.actor === 'EITHER') {
    return actorRole === 'CLIENT' || actorRole === 'WORKER' || actorRole === 'SYSTEM';
  }
  return actorRole === rule.actor || actorRole === 'SYSTEM';
}

/**
 * The booking status that mirrors an escrow state. Every EscrowState name also
 * exists in BookingStatus (that is what BookingStatus.ACCEPTED was added for), so
 * the projection is name-for-name — kept as an explicit map rather than a cast so
 * a future divergence is a compile error here, not a silent mismatch in a read.
 */
export function bookingStatusForEscrowState(state: EscrowState): BookingStatus {
  switch (state) {
    case EscrowState.PAID:
      return BookingStatus.PAID;
    case EscrowState.ACCEPTED:
      return BookingStatus.ACCEPTED;
    case EscrowState.IN_PROGRESS:
      return BookingStatus.IN_PROGRESS;
    case EscrowState.COMPLETED:
      return BookingStatus.COMPLETED;
    case EscrowState.RELEASED:
      return BookingStatus.RELEASED;
    case EscrowState.REFUNDED:
      return BookingStatus.REFUNDED;
    case EscrowState.DISPUTED:
      return BookingStatus.DISPUTED;
  }
}

/**
 * The job status a released/refunded/disputed/started escrow drives (SRS §21.3).
 * Null for escrow moves the job lifecycle has no rung for (PAID, ACCEPTED — the
 * job is already ACCEPTED at that point).
 */
export function jobStatusForEscrowState(state: EscrowState): JobStatus | null {
  switch (state) {
    case EscrowState.IN_PROGRESS:
      return JobStatus.IN_PROGRESS;
    case EscrowState.COMPLETED:
      return JobStatus.COMPLETED;
    case EscrowState.RELEASED:
      return JobStatus.RELEASED;
    case EscrowState.REFUNDED:
      return JobStatus.REFUNDED;
    case EscrowState.DISPUTED:
      return JobStatus.DISPUTED;
    default:
      return null;
  }
}
