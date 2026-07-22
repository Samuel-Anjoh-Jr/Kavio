import type { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DisputeFaultParty,
  DisputeResolution,
  EscrowState,
  TrustEventType,
} from '@trustpro/database';
import type { AuthenticatedUser } from '../../auth/auth.types';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TrustScoreService } from '../../trust/trust-score.service';
import type { EscrowService } from '../escrow/escrow.service';
import { DisputesService } from './disputes.service';
import type { ResolveDisputeDto } from './dto/dispute.dto';

const ADMIN = { id: 'admin-1' } as AuthenticatedUser;

function makeHarness(disputeOverrides: Record<string, unknown> = {}) {
  const dispute = {
    id: 'dispute-1',
    bookingId: 'booking-1',
    jobId: 'job-1',
    status: 'OPEN',
    booking: { clientId: 'client-1', workerId: 'worker-1' },
    escrowHold: { state: EscrowState.DISPUTED },
    ...disputeOverrides,
  };

  const prisma = {
    client: {
      dispute: {
        findUnique: jest.fn().mockResolvedValue(dispute),
        update: jest.fn().mockResolvedValue({}),
      },
      disputeMessage: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
        if (typeof fn === 'function') {
          return fn({
            dispute: { update: jest.fn().mockResolvedValue({}) },
            disputeMessage: { create: jest.fn().mockResolvedValue({}) },
          });
        }
        return [];
      }),
    },
  } as unknown as PrismaService;

  const escrow = {
    resolveDispute: jest.fn().mockResolvedValue({}),
  } as unknown as EscrowService;

  const record = jest.fn().mockResolvedValue({});
  const emit = jest.fn();

  const service = new DisputesService(prisma, { emit } as unknown as EventEmitter2, escrow, {
    record,
  } as unknown as TrustScoreService);

  return { service, prisma, escrow, record, emit };
}

const resolveDto = (overrides: Partial<ResolveDisputeDto> = {}): ResolveDisputeDto => ({
  resolution: DisputeResolution.REFUND_TO_CLIENT,
  ...overrides,
});

describe('DisputesService.resolve — money and trust (ADM-05)', () => {
  it('refunds the client and penalises the worker by default', async () => {
    const { service, escrow, record } = makeHarness();

    await service.resolve(ADMIN, 'dispute-1', resolveDto());

    // Drives the escrow…
    expect(escrow.resolveDispute).toHaveBeenCalledWith(
      'booking-1',
      EscrowState.REFUNDED,
      'admin-1',
      undefined,
    );
    // …and the reputation: a refund defaults to worker-at-fault.
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'worker-1',
        type: TrustEventType.DISPUTE_UPHELD,
        actorId: 'admin-1',
        sourceType: 'Dispute',
        sourceId: 'dispute-1',
      }),
    );
  });

  it('releases to the worker and charges the client the lighter penalty', async () => {
    const { service, escrow, record } = makeHarness();

    await service.resolve(
      ADMIN,
      'dispute-1',
      resolveDto({ resolution: DisputeResolution.RELEASE_TO_WORKER }),
    );

    expect(escrow.resolveDispute).toHaveBeenCalledWith(
      'booking-1',
      EscrowState.RELEASED,
      'admin-1',
      undefined,
    );
    // The complaint did not hold up and it froze a worker's payout, so it lands
    // on the client — but as DISPUTE_LOST (−10), not the worker's −20.
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'client-1',
        type: TrustEventType.DISPUTE_LOST,
        actorId: 'admin-1',
        sourceType: 'Dispute',
        sourceId: 'dispute-1',
      }),
    );
  });

  it('lets an admin clear a good-faith escalation of all fault', async () => {
    // The escape hatch: a client who escalated honestly and simply did not
    // prevail pays nothing, so the dispute process stays safe to use.
    const { service, record } = makeHarness();

    await service.resolve(
      ADMIN,
      'dispute-1',
      resolveDto({
        resolution: DisputeResolution.RELEASE_TO_WORKER,
        faultParty: DisputeFaultParty.NONE,
      }),
    );

    expect(record).not.toHaveBeenCalled();
  });

  it('honours an explicit fault finding that overrides the default', async () => {
    // A refund normally faults the worker, but an admin who finds the client
    // engineered it can say so — and the client takes the client-side penalty.
    const { service, record } = makeHarness();

    await service.resolve(
      ADMIN,
      'dispute-1',
      resolveDto({
        resolution: DisputeResolution.REFUND_TO_CLIENT,
        faultParty: DisputeFaultParty.CLIENT,
      }),
    );

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: 'client-1', type: TrustEventType.DISPUTE_LOST }),
    );
  });

  it('escalates on request-info without moving money or trust', async () => {
    const { service, escrow, record } = makeHarness();

    const result = await service.resolve(
      ADMIN,
      'dispute-1',
      resolveDto({ resolution: DisputeResolution.REQUEST_INFO }),
    );

    expect(result.status).toBe('ESCALATED');
    expect(escrow.resolveDispute).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('refuses to close a dispute while its escrow is still frozen', async () => {
    const { service, record } = makeHarness({ escrowHold: { state: EscrowState.DISPUTED } });

    await expect(
      service.resolve(
        ADMIN,
        'dispute-1',
        resolveDto({ resolution: DisputeResolution.CLOSE_NO_ACTION }),
      ),
    ).rejects.toMatchObject({ code: 'ESCROW_STILL_FROZEN' });

    // Money frozen, so no trust penalty either — the case is not actually settled.
    expect(record).not.toHaveBeenCalled();
  });

  it('refuses to resolve an already-resolved dispute', async () => {
    const { service, escrow } = makeHarness({ status: 'RESOLVED' });

    await expect(service.resolve(ADMIN, 'dispute-1', resolveDto())).rejects.toMatchObject({
      code: 'ALREADY_RESOLVED',
    });
    expect(escrow.resolveDispute).not.toHaveBeenCalled();
  });
});
