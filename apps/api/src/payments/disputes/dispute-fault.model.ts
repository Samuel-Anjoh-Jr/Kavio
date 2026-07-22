import { DisputeFaultParty, DisputeResolution } from '@trustpro/database';

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
 *   RELEASE_TO_WORKER  → NONE: the freeze ended and the worker was paid, which
 *                        usually means the complaint did not hold up — but the
 *                        client raising it is not thereby AT FAULT, so no penalty
 *                        by default. An admin who finds the client abused the
 *                        process sets CLIENT explicitly.
 *   REQUEST_INFO       → NONE: nothing is decided yet.
 *   CLOSE_NO_ACTION    → NONE: the parties settled, or there was nothing to it.
 *
 * A DEFAULT, not a verdict: every resolution path lets the admin override, and
 * this only fills the blank so the common case needs no extra click.
 */
export function defaultFaultParty(resolution: DisputeResolution): DisputeFaultParty {
  switch (resolution) {
    case DisputeResolution.REFUND_TO_CLIENT:
      return DisputeFaultParty.WORKER;
    case DisputeResolution.RELEASE_TO_WORKER:
    case DisputeResolution.REQUEST_INFO:
    case DisputeResolution.CLOSE_NO_ACTION:
      return DisputeFaultParty.NONE;
  }
}

/**
 * Which identity, if any, the DISPUTE_UPHELD penalty lands on (§21.5).
 *
 * Returns the faulted party's id, or null when nobody is at fault — the common
 * outcome, which must cost no one anything. The parties are passed in rather than
 * resolved here so this stays a pure mapping from a finding to a subject.
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
