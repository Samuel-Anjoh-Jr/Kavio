import { QuoteStatus } from '@trustpro/database';

/**
 * The quote lifecycle as a PURE state machine (QTE-03, SRS §3.6).
 *
 * The states are exactly the six QTE-03 names: Draft, Sent, Viewed, Accepted,
 * Declined, Expired. The transitions encode who may make each move — the WORKER
 * authors and sends, the CLIENT views and responds — so a service can ask one
 * question ("may this party make this move from here?") instead of scattering
 * the rules across endpoints.
 *
 *   Draft    → Sent (worker sends), Expired
 *   Sent     → Viewed (client opens), Accepted, Declined, Expired
 *   Viewed   → Accepted, Declined, Expired
 *   Accepted → terminal (a booking now exists)
 *   Declined → terminal (a revision is a NEW quote, not a reopen)
 *   Expired  → terminal
 *
 * A counter-offer is NOT a transition: the client requesting one leaves the
 * quote where it is and the worker answers with a fresh revised quote, so there
 * is no ACCEPTED-back-to-DRAFT edge to model. That keeps every price the client
 * ever saw preserved as its own row.
 */

export type QuoteActor =
  /** The worker who authored the quote. */
  | 'WORKER'
  /** The client the quote was sent to. */
  | 'CLIENT'
  /** The platform: the expiry sweep. */
  | 'SYSTEM';

interface QuoteRule {
  readonly to: QuoteStatus;
  readonly actor: QuoteActor;
}

export const QUOTE_TRANSITIONS: Readonly<Record<QuoteStatus, readonly QuoteRule[]>> = {
  [QuoteStatus.DRAFT]: [
    { to: QuoteStatus.SENT, actor: 'WORKER' },
    { to: QuoteStatus.EXPIRED, actor: 'SYSTEM' },
  ],
  [QuoteStatus.SENT]: [
    // Marked when the client first opens it — the "Viewed" signal (QTE-04).
    { to: QuoteStatus.VIEWED, actor: 'CLIENT' },
    { to: QuoteStatus.ACCEPTED, actor: 'CLIENT' },
    { to: QuoteStatus.DECLINED, actor: 'CLIENT' },
    { to: QuoteStatus.EXPIRED, actor: 'SYSTEM' },
  ],
  [QuoteStatus.VIEWED]: [
    { to: QuoteStatus.ACCEPTED, actor: 'CLIENT' },
    { to: QuoteStatus.DECLINED, actor: 'CLIENT' },
    { to: QuoteStatus.EXPIRED, actor: 'SYSTEM' },
  ],
  [QuoteStatus.ACCEPTED]: [],
  [QuoteStatus.DECLINED]: [],
  [QuoteStatus.EXPIRED]: [],
};

/** States a quote can never leave. */
export const TERMINAL_QUOTE_STATUSES: readonly QuoteStatus[] = (
  Object.keys(QUOTE_TRANSITIONS) as QuoteStatus[]
).filter((status) => QUOTE_TRANSITIONS[status].length === 0);

export function isTerminalQuoteStatus(status: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[status].length === 0;
}

/** Whether `from → to` is legal at all, ignoring who is asking. */
export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].some((rule) => rule.to === to);
}

export function quoteTransitionRule(from: QuoteStatus, to: QuoteStatus): QuoteRule | null {
  return QUOTE_TRANSITIONS[from].find((rule) => rule.to === to) ?? null;
}

/**
 * Whether a party may make the `from → to` move. SYSTEM moves (expiry) are not
 * authorised to a human actor — a client cannot mark a quote expired to escape
 * having to decline it — while SYSTEM may stand in for either party's move.
 */
export function isQuoteTransitionAllowedFor(
  from: QuoteStatus,
  to: QuoteStatus,
  actor: QuoteActor,
): boolean {
  const rule = quoteTransitionRule(from, to);
  if (!rule) {
    return false;
  }
  if (rule.actor === 'SYSTEM') {
    return actor === 'SYSTEM';
  }
  return actor === rule.actor || actor === 'SYSTEM';
}
