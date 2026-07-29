import { JobStatus } from '@kavio/database';

/**
 * The job lifecycle as a PURE state machine (JOB-05, SRS §21.3).
 *
 * The transition table is the single source of truth for which moves are legal.
 * It lives here, as data, with no database or request in sight, so it can be
 * exhaustively tested and so every service that moves a job asks the same
 * question the same way. A `status` field that any code path can set to any
 * value is not a lifecycle — it is a bug waiting for the first out-of-order
 * webhook.
 *
 * The table reproduces SRS §21.3 exactly:
 *
 *   Draft       → Open (publish), Archived
 *   Open        → Quoted, Cancelled
 *   Quoted      → Accepted, Cancelled
 *   Accepted    → In Progress, Refunded
 *   In Progress → Completed, Disputed
 *   Completed   → Released, Disputed
 *   Released    → terminal
 *   Disputed    → Released, Refunded
 *   Cancelled / Refunded / Archived → terminal
 *
 * Two pragmatic additions the table implies rather than draws, each flagged
 * below: Open/Quoted may be ARCHIVED (a poster closing out a job that never
 * filled is the same close-out that reaches Archived from Draft), and a settled
 * Cancelled/Refunded/Released job may be ARCHIVED off the active lists. Nothing
 * here ever lets a job skip a rung or climb back up one.
 */

/** Who is expected to drive a transition. The service authorises against this. */
export type TransitionActor =
  /** The client who posted the job. */
  | 'POSTER'
  /** The worker hired onto the job. */
  | 'WORKER'
  /** Either party (a dispute can be raised by either side). */
  | 'EITHER'
  /** The platform: escrow webhooks, the first-quote trigger, expiry sweeps. */
  | 'SYSTEM';

interface TransitionRule {
  readonly to: JobStatus;
  readonly actor: TransitionActor;
}

/**
 * The legal moves out of each state, with who may make them.
 *
 * Every key is present, terminal states included, so a lookup is never
 * `undefined` — a terminal state is an empty array, which reads as "no moves",
 * not "unknown state".
 */
export const JOB_TRANSITIONS: Readonly<Record<JobStatus, readonly TransitionRule[]>> = {
  [JobStatus.DRAFT]: [
    { to: JobStatus.OPEN, actor: 'POSTER' },
    { to: JobStatus.ARCHIVED, actor: 'POSTER' },
  ],
  [JobStatus.OPEN]: [
    // Entered automatically when the first quote lands (§21.3 "≥ 1 quote").
    { to: JobStatus.QUOTED, actor: 'SYSTEM' },
    { to: JobStatus.CANCELLED, actor: 'POSTER' },
    { to: JobStatus.ARCHIVED, actor: 'POSTER' },
  ],
  [JobStatus.QUOTED]: [
    // Entered when the poster accepts a quote (escrow becomes Paid).
    { to: JobStatus.ACCEPTED, actor: 'POSTER' },
    { to: JobStatus.CANCELLED, actor: 'POSTER' },
    { to: JobStatus.ARCHIVED, actor: 'POSTER' },
  ],
  [JobStatus.ACCEPTED]: [
    { to: JobStatus.IN_PROGRESS, actor: 'WORKER' },
    // Escrow reversed before work began (Campay refund webhook).
    { to: JobStatus.REFUNDED, actor: 'SYSTEM' },
  ],
  [JobStatus.IN_PROGRESS]: [
    { to: JobStatus.COMPLETED, actor: 'WORKER' },
    { to: JobStatus.DISPUTED, actor: 'EITHER' },
  ],
  [JobStatus.COMPLETED]: [
    // The client confirming completion is what releases the escrow (JOB-07).
    { to: JobStatus.RELEASED, actor: 'POSTER' },
    { to: JobStatus.DISPUTED, actor: 'EITHER' },
  ],
  [JobStatus.RELEASED]: [],
  [JobStatus.DISPUTED]: [
    // Admin resolution, one way or the other (§21.3 "Released, Refunded (admin)").
    { to: JobStatus.RELEASED, actor: 'SYSTEM' },
    { to: JobStatus.REFUNDED, actor: 'SYSTEM' },
  ],
  [JobStatus.CANCELLED]: [{ to: JobStatus.ARCHIVED, actor: 'POSTER' }],
  [JobStatus.REFUNDED]: [{ to: JobStatus.ARCHIVED, actor: 'POSTER' }],
  [JobStatus.ARCHIVED]: [],
};

/** States a job can never leave. Derived from the table, not restated. */
export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = (
  Object.keys(JOB_TRANSITIONS) as JobStatus[]
).filter((status) => JOB_TRANSITIONS[status].length === 0);

/** True once a job has reached a state it can never leave. */
export function isTerminalJobStatus(status: JobStatus): boolean {
  return JOB_TRANSITIONS[status].length === 0;
}

/** Whether `from → to` is a legal move at all, ignoring who is asking. */
export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].some((rule) => rule.to === to);
}

/** The rule for a specific move, or null when the move is illegal. */
export function jobTransitionRule(from: JobStatus, to: JobStatus): TransitionRule | null {
  return JOB_TRANSITIONS[from].find((rule) => rule.to === to) ?? null;
}

/**
 * Whether an actor in `actorRole` may make the `from → to` move.
 *
 * SYSTEM transitions are never authorised to a human actor here: a client must
 * not be able to declare their own escrow refunded by calling the transition
 * endpoint, so those moves are reachable only from the code paths that own them
 * (the escrow webhook handler, the first-quote trigger). A SYSTEM caller passes
 * `actorRole: 'SYSTEM'` explicitly.
 */
export function isTransitionAllowedFor(
  from: JobStatus,
  to: JobStatus,
  actorRole: TransitionActor,
): boolean {
  const rule = jobTransitionRule(from, to);
  if (!rule) {
    return false;
  }
  if (rule.actor === 'SYSTEM') {
    return actorRole === 'SYSTEM';
  }
  if (rule.actor === 'EITHER') {
    return actorRole === 'POSTER' || actorRole === 'WORKER' || actorRole === 'SYSTEM';
  }
  // A specific party's move: that party, or the system acting on their behalf.
  return actorRole === rule.actor || actorRole === 'SYSTEM';
}
