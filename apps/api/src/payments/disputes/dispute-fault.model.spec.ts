import { DisputeFaultParty, DisputeResolution } from '@trustpro/database';
import { defaultFaultParty, isTerminalResolution, penalisedParty } from './dispute-fault.model';

const PARTIES = { clientId: 'client-1', workerId: 'worker-1' };

/**
 * Fault is the input to the −20 trust penalty (§21.5), so the mapping from a
 * resolution to a default finding — and from a finding to the penalised identity
 * — is pinned here rather than left implicit in the service.
 */
describe('dispute-fault.model (ADM-05, §21.5)', () => {
  describe('default fault finding', () => {
    it('faults the worker on a refund — the work was not delivered', () => {
      expect(defaultFaultParty(DisputeResolution.REFUND_TO_CLIENT)).toBe(DisputeFaultParty.WORKER);
    });

    it('faults nobody on a release — winning a dispute is not misconduct', () => {
      // The load-bearing default: a client who escalates in good faith and loses
      // must not be penalised, or nobody will ever use the dispute process.
      expect(defaultFaultParty(DisputeResolution.RELEASE_TO_WORKER)).toBe(DisputeFaultParty.NONE);
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
