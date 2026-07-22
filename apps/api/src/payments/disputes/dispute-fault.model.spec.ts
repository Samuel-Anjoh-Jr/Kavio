import { DisputeFaultParty, DisputeResolution, TrustEventType } from '@trustpro/database';
import {
  defaultFaultParty,
  isTerminalResolution,
  penalisedParty,
  trustEventForFault,
} from './dispute-fault.model';

const PARTIES = { clientId: 'client-1', workerId: 'worker-1' };

/**
 * Fault is the input to the dispute trust penalties (§21.5), so the mapping from
 * a resolution to a default finding, from a finding to the penalised identity,
 * and from a finding to WHICH penalty, are all pinned here rather than left
 * implicit in the service.
 */
describe('dispute-fault.model (ADM-05, §21.5)', () => {
  describe('default fault finding', () => {
    it('faults the worker on a refund — the work was not delivered', () => {
      expect(defaultFaultParty(DisputeResolution.REFUND_TO_CLIENT)).toBe(DisputeFaultParty.WORKER);
    });

    it('faults the client on a release — their complaint did not hold up', () => {
      // A client CAN abuse the process: freezing a worker's payout on a claim
      // that fails is a real cost to the worker, and a worker weighing that
      // client's next job deserves to see it happened. The admin still overrides
      // to NONE for a good-faith escalation that simply did not prevail.
      expect(defaultFaultParty(DisputeResolution.RELEASE_TO_WORKER)).toBe(DisputeFaultParty.CLIENT);
    });

    it('faults nobody on request-info or a no-action close', () => {
      expect(defaultFaultParty(DisputeResolution.REQUEST_INFO)).toBe(DisputeFaultParty.NONE);
      expect(defaultFaultParty(DisputeResolution.CLOSE_NO_ACTION)).toBe(DisputeFaultParty.NONE);
    });

    it('has a default for every resolution', () => {
      for (const resolution of Object.values(DisputeResolution)) {
        expect(Object.values(DisputeFaultParty)).toContain(defaultFaultParty(resolution));
      }
    });
  });

  describe('which penalty a finding records', () => {
    it('charges a worker at fault the full non-delivery penalty', () => {
      expect(trustEventForFault(DisputeFaultParty.WORKER)).toBe(TrustEventType.DISPUTE_UPHELD);
    });

    it('charges a client at fault the lighter lost-dispute penalty', () => {
      // Asymmetric on purpose: failing to deliver paid work is a graver breach
      // than a complaint that did not hold up.
      expect(trustEventForFault(DisputeFaultParty.CLIENT)).toBe(TrustEventType.DISPUTE_LOST);
    });

    it('records nothing when nobody is at fault', () => {
      expect(trustEventForFault(DisputeFaultParty.NONE)).toBeNull();
    });

    it('has an answer for every finding', () => {
      for (const fault of Object.values(DisputeFaultParty)) {
        const event = trustEventForFault(fault);
        expect(event === null || Object.values(TrustEventType).includes(event)).toBe(true);
      }
    });
  });

  describe('penalised party', () => {
    it('maps a finding to the right identity', () => {
      expect(penalisedParty(DisputeFaultParty.CLIENT, PARTIES)).toBe('client-1');
      expect(penalisedParty(DisputeFaultParty.WORKER, PARTIES)).toBe('worker-1');
    });

    it('penalises no one when nobody is at fault', () => {
      expect(penalisedParty(DisputeFaultParty.NONE, PARTIES)).toBeNull();
    });
  });

  describe('terminal resolution', () => {
    it('treats request-info as non-terminal and everything else as terminal', () => {
      expect(isTerminalResolution(DisputeResolution.REQUEST_INFO)).toBe(false);
      expect(isTerminalResolution(DisputeResolution.RELEASE_TO_WORKER)).toBe(true);
      expect(isTerminalResolution(DisputeResolution.REFUND_TO_CLIENT)).toBe(true);
      expect(isTerminalResolution(DisputeResolution.CLOSE_NO_ACTION)).toBe(true);
    });
  });
});
