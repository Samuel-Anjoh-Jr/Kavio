import { TrustEventType } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../lib/app-exception';
import { ADMIN_ADJUSTMENT_MAX_MAGNITUDE } from './trust-score.model';
import { TrustAdjustmentService } from './trust-adjustment.service';
import type { TrustScoreService } from './trust-score.service';

const ADMIN = { id: 'admin-1' } as AuthenticatedUser;

function makeHarness(
  options: {
    subject?: { id: string; trustScore: number; status: string } | null;
    suspended?: boolean;
    total?: number;
  } = {},
) {
  const subject =
    options.subject === undefined
      ? { id: 'worker-1', trustScore: 40, status: 'ACTIVE' }
      : options.subject;

  const auditCreate = jest.fn().mockResolvedValue({});
  const prisma = {
    client: {
      user: { findUnique: jest.fn().mockResolvedValue(subject) },
      auditLog: { create: auditCreate },
    },
  } as unknown as PrismaService;

  const record = jest.fn().mockResolvedValue({ total: options.total ?? 50 });
  const currentResult = jest.fn().mockResolvedValue({ suspended: options.suspended ?? false });

  const service = new TrustAdjustmentService(prisma, {
    record,
    currentResult,
  } as unknown as TrustScoreService);

  return { service, record, currentResult, auditCreate };
}

async function expectRejection(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppException);
  await promise.catch((error: AppException) => expect(error.code).toBe(code));
}

describe('TrustAdjustmentService (ADM-04)', () => {
  it('applies an adjustment as an ADMIN_ADJUSTMENT trust event, never an edit', async () => {
    const { service, record } = makeHarness({ total: 55 });

    const result = await service.adjust(ADMIN, 'worker-1', 15, 'Field-Verified Founding bonus.');

    // The whole design: a score change is an appended event replayed by the
    // model, carrying its own delta and the acting admin.
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'worker-1',
        type: TrustEventType.ADMIN_ADJUSTMENT,
        actorId: 'admin-1',
        delta: 15,
      }),
    );
    expect(result.total).toBe(55);
  });

  it('carries the reason onto the event metadata', async () => {
    const { service, record } = makeHarness();
    await service.adjust(ADMIN, 'worker-1', -20, 'Confirmed off-platform fraud pattern.');
    expect(record.mock.calls[0][0].metadata).toEqual({
      reason: 'Confirmed off-platform fraud pattern.',
    });
  });

  it('audits who moved whose score, by how much, and to what', async () => {
    const { service, auditCreate } = makeHarness({
      subject: { id: 'worker-1', trustScore: 40, status: 'ACTIVE' },
      total: 55,
    });

    await service.adjust(ADMIN, 'worker-1', 15, 'Field-Verified Founding bonus.');

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin-1',
          action: 'trust.adjusted',
          target: 'User:worker-1',
          meta: expect.objectContaining({ delta: 15, previousScore: 40, newScore: 55 }),
        }),
      }),
    );
  });

  it('refuses a zero adjustment', async () => {
    const { service, record } = makeHarness();
    await expectRejection(service.adjust(ADMIN, 'worker-1', 0, 'no-op'), 'INVALID_ADJUSTMENT');
    expect(record).not.toHaveBeenCalled();
  });

  it('refuses a non-integer adjustment', async () => {
    const { service } = makeHarness();
    await expectRejection(
      service.adjust(ADMIN, 'worker-1', 2.5, 'fractional'),
      'INVALID_ADJUSTMENT',
    );
  });

  it('refuses an adjustment beyond the per-event ceiling', async () => {
    const { service, record } = makeHarness();
    await expectRejection(
      service.adjust(ADMIN, 'worker-1', ADMIN_ADJUSTMENT_MAX_MAGNITUDE + 1, 'too big'),
      'ADJUSTMENT_TOO_LARGE',
    );
    // Refused at the edge, not silently clamped — nothing is recorded.
    expect(record).not.toHaveBeenCalled();
  });

  it('allows an adjustment exactly at the ceiling', async () => {
    const { service, record } = makeHarness();
    await service.adjust(ADMIN, 'worker-1', ADMIN_ADJUSTMENT_MAX_MAGNITUDE, 'maximum bonus');
    expect(record).toHaveBeenCalled();
  });

  it('refuses to adjust a subject that does not exist', async () => {
    const { service, record } = makeHarness({ subject: null });
    await expectRejection(service.adjust(ADMIN, 'ghost', 10, 'nobody home'), 'SUBJECT_NOT_FOUND');
    expect(record).not.toHaveBeenCalled();
  });

  it('refuses to adjust a suspended identity', async () => {
    // Fraud is a verdict, not a number; a bonus must never look like a way around
    // it, and a further penalty is meaningless against a zeroed score (TRU-08).
    const { service, record } = makeHarness({ suspended: true });
    await expectRejection(service.adjust(ADMIN, 'worker-1', 10, 'reinstate?'), 'SUBJECT_SUSPENDED');
    expect(record).not.toHaveBeenCalled();
  });
});
