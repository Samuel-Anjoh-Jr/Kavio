import { DisputeFaultParty, DisputeResolution, TrustEventType } from '@trustpro/database';

/**
 * How an admin's resolution and fault finding turn into a trust consequence
 * (ADM-05, §21.5 "disputes −20"), as PURE functions.
 *
 * The design decision this file exists to protect: FAULT IS NOT THE RESOLUTION.
 * The direction the money went does not settle who behaved badly, and deriving a
 * 20-point penalty from the resolution alone would punish a client for
 * legitimately escalating and losing — which teaches everyone never to use the
 * dispute process, the one thing an escrow product cannot afford. So the admin,
 * the only one who read the evidence, records fault explicitly; the resolution
 * merely supplies a sensible default.
 */

/**
 * The default fault finding for a resolution, when the admin does not state one.
 *
 *   REFUND_TO_CLIENT   → the worker: the work was not delivered, so the money
 *                        went back. The common reason a refund happens.
 *   RELEASE_TO_WORKER  → the client: the freeze ended and the worker was paid,
 *                        which means the complaint did not hold up. The client
 *                        froze someone's payout on a claim that failed, and that
 *                        is worth recording — a worker deciding whether to take
 *                        this client's next job deserves to know it happened.
 *   REQUEST_INFO       → NONE: nothing is decided yet.
 *   CLOSE_NO_ACTION    → NONE: the parties settled, or there was nothing to it.
 *
 * A DEFAULT, not a verdict. The admin overrides to NONE whenever the client
 * escalated in good faith and simply did not prevail — which is the escape hatch
 * that stops this from teaching people never to use the dispute process at all.
 * The two faults are also NOT priced the same; see {@link trustEventForFault}.
 */
export function defaultFaultParty(resolution: DisputeResolution): DisputeFaultParty {
  switch (resolution) {
    case DisputeResolution.REFUND_TO_CLIENT:
      return DisputeFaultParty.WORKER;
    case DisputeResolution.RELEASE_TO_WORKER:
      return DisputeFaultParty.CLIENT;
    case DisputeResolution.REQUEST_INFO:
    case DisputeResolution.CLOSE_NO_ACTION:
      return DisputeFaultParty.NONE;
  }
}

/**
 * Which trust event a fault finding records (§21.5).
 *
 * The asymmetry is the point. A worker who took payment and did not deliver
 * broke the core bargain the escrow exists to secure (−20 DISPUTE_UPHELD); a
 * client whose complaint did not hold up froze a payout and cost the worker time
 * (−10 DISPUTE_LOST). Both are real failures and both belong in the Marketplace
 * pillar, but charging them identically would either under-punish non-delivery
 * or make raising a dispute as costly as failing to do the job.
 */
export function trustEventForFault(fault: DisputeFaultParty): TrustEventType | null {
  switch (fault) {
    case DisputeFaultParty.WORKER:
      return TrustEventType.DISPUTE_UPHELD;
    case DisputeFaultParty.CLIENT:
      return TrustEventType.DISPUTE_LOST;
    case DisputeFaultParty.NONE:
      return null;
  }
}

/**
 * Which identity, if any, the dispute penalty lands on (§21.5).
 *
 * Returns the faulted party's id, or null when the admin found nobody at fault —
 * which must cost no one anything. WHICH penalty they take is
 * {@link trustEventForFault}'s answer, not this one. The parties are passed in
 * rather than resolved here so this stays a pure mapping from a finding to a
 * subject.
 */
export function penalisedParty(
  fault: DisputeFaultParty,
  parties: { clientId: string; workerId: string },
): string | null {
  switch (fault) {
    case DisputeFaultParty.CLIENT:
      return parties.clientId;
    case DisputeFaultParty.WORKER:
      return parties.workerId;
    case DisputeFaultParty.NONE:
      return null;
  }
}

/**
 * Whether a resolution is TERMINAL — the dispute is settled and its trust
 * consequence, if any, should be recorded now.
 *
 * REQUEST_INFO is the one that is not: it escalates and keeps the case open, so
 * no fault is recorded and no penalty is applied until a real resolution lands.
 */
export function isTerminalResolution(resolution: DisputeResolution): boolean {
  return resolution !== DisputeResolution.REQUEST_INFO;
}
