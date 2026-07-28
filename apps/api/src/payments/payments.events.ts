/**
 * Emitted after a PENDING money row is written while Campay is in STUB mode
 * (no credentials configured — see `isCampayLive`).
 *
 * With no credentials there is no operator to confirm the collection and no
 * webhook will ever arrive, so a development or CI escrow would sit PENDING
 * forever and every state past it — release, payout, dispute, refund — would be
 * unreachable. The listener drives the ordinary reconciliation path against the
 * stub's SUCCESSFUL status, which is deliberately the SAME code a live webhook
 * triggers rather than a second settlement path that could drift from it.
 *
 * This is inert the moment real credentials exist: `campay.live` is then true
 * and the event is never emitted.
 */
export const CAMPAY_STUB_SETTLED = 'payments.campay.stub_settled';

export interface CampayStubSettledEvent {
  externalReference: string;
}
