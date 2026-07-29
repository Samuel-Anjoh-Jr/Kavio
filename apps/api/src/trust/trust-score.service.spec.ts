import { TrustEventType, TrustPillar, UserStatus } from '@kavio/database';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../prisma/prisma.service';
import type { TierService } from './tier.service';
import { nominalDeltaFor, TrustScoreService } from './trust-score.service';
import {
  TrustScoreThresholdCrossedEvent,
  TrustSuspendedEvent,
  TRUST_RECOMPUTED,
  TRUST_SCORE_THRESHOLD_CROSSED,
  TRUST_SUSPENDED,
} from './trust.events';

function makeHarness(options: {
  events?: { type: TrustEventType }[];
  previous?: { total: number; suspended: boolean } | null;
}) {
  const trustEventCreate = jest.fn().mockResolvedValue({ id: 'event-1' });
  const upsert = jest.fn().mockReturnValue({ __op: 'upsert' });
  const userUpdate = jest.fn().mockReturnValue({ __op: 'userUpdate' });
  const auditCreate = jest.fn().mockResolvedValue({});
  const transaction = jest.fn().mockResolvedValue([]);

  const prisma = {
    client: {
      trustEvent: {
        create: trustEventCreate,
        findMany: jest.fn().mockResolvedValue(options.events ?? []),
      },
      trustScore: {
        findUnique: jest.fn().mockResolvedValue(options.previous ?? null),
        upsert,
      },
      user: { update: userUpdate },
      auditLog: { create: auditCreate },
      $transaction: transaction,
    },
  } as unknown as PrismaService;

  const applyDerivedTier = jest
    .fn()
    .mockResolvedValue({ tier: 'TIER_0', nextTier: null, unmet: [] });
  const tiers = { applyDerivedTier } as unknown as TierService;

  const emit = jest.fn();
  const emitter = { emit } as unknown as EventEmitter2;

  return {
    service: new TrustScoreService(prisma, tiers, emitter),
    emit,
    trustEventCreate,
    upsert,
    userUpdate,
    auditCreate,
    applyDerivedTier,
  };
}

const log = (...types: TrustEventType[]) => types.map((type) => ({ type }));

/**
 * `expect.objectContaining` is typed `any`, which trips no-unsafe-assignment the
 * moment it is nested inside an expected object. Narrowing it once here keeps the
 * assertions below both partial and lint-clean.
 */
const containing = (value: Record<string, unknown>): object =>
  expect.objectContaining(value) as object;

describe('TrustScoreService', () => {
  describe('record', () => {
    it('appends to the ledger with the rule’s pillar and nominal delta', async () => {
      const { service, trustEventCreate } = makeHarness({});

      await service.record({
        subjectId: 'user-1',
        type: TrustEventType.ID_VERIFIED,
        actorId: 'admin-1',
        sourceType: 'VerificationRecord',
        sourceId: 'check-1',
      });

      expect(trustEventCreate).toHaveBeenCalledWith({
        data: containing({
          subjectId: 'user-1',
          type: TrustEventType.ID_VERIFIED,
          pillar: TrustPillar.IDENTITY,
          delta: 20,
          actorId: 'admin-1',
          sourceType: 'VerificationRecord',
          sourceId: 'check-1',
        }),
      });
    });

    it('records a system event with no actor', async () => {
      const { service, trustEventCreate } = makeHarness({});
      await service.record({ subjectId: 'user-1', type: TrustEventType.ACCOUNT_CREATED });

      expect(trustEventCreate).toHaveBeenCalledWith({
        data: containing({ actorId: null }),
      });
    });

    it('recomputes after appending, so the snapshot is never stale', async () => {
      const { service, upsert } = makeHarness({
        events: log(TrustEventType.ACCOUNT_CREATED, TrustEventType.PHONE_VERIFIED),
      });

      await service.record({ subjectId: 'user-1', type: TrustEventType.PHONE_VERIFIED });

      expect(upsert).toHaveBeenCalledWith(
        containing({
          where: { subjectId: 'user-1' },
          update: containing({ total: 25, identityScore: 25 }),
        }),
      );
    });
  });

  describe('recompute', () => {
    it('writes the four sub-scores and the total from the replayed ledger', async () => {
      const { service, upsert } = makeHarness({
        events: log(
          TrustEventType.ACCOUNT_CREATED,
          TrustEventType.PHONE_VERIFIED,
          TrustEventType.ID_VERIFIED,
          TrustEventType.PORTFOLIO_ADDED,
        ),
      });

      await service.recompute('user-1');

      expect(upsert).toHaveBeenCalledWith(
        containing({
          update: containing({
            identityScore: 45,
            professionalScore: 10,
            marketplaceScore: 0,
            financialScore: 0,
            total: 55,
            eventCount: 4,
          }),
        }),
      );
    });

    it('mirrors the total onto User so hot read paths need no join', async () => {
      const { service, userUpdate } = makeHarness({
        events: log(TrustEventType.ACCOUNT_CREATED),
      });

      await service.recompute('user-1');

      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { trustScore: 15 },
      });
    });

    it('derives the tier only after the new score has been written', async () => {
      const { service, applyDerivedTier } = makeHarness({
        events: log(TrustEventType.ACCOUNT_CREATED),
      });

      await service.recompute('user-1');
      expect(applyDerivedTier).toHaveBeenCalledWith('user-1');
    });

    it('does not clobber averageRating, which the reviews module owns', async () => {
      const { service, upsert } = makeHarness({ events: log(TrustEventType.ACCOUNT_CREATED) });

      await service.recompute('user-1');

      const [firstCall] = upsert.mock.calls as [{ create: object; update: object }][];
      const args = firstCall?.[0];

      expect(args).toBeDefined();
      expect(args?.create).not.toHaveProperty('averageRating');
      expect(args?.update).not.toHaveProperty('averageRating');
    });
  });

  describe('threshold crossings', () => {
    it('emits one event per milestone passed', async () => {
      const { service, emit } = makeHarness({
        // 15 + 10 + 20 + 15 + 10 = 70, from a previous score of 15.
        events: log(
          TrustEventType.ACCOUNT_CREATED,
          TrustEventType.PHONE_VERIFIED,
          TrustEventType.ID_VERIFIED,
          TrustEventType.FIELD_VERIFIED,
          TrustEventType.PORTFOLIO_ADDED,
        ),
        previous: { total: 15, suspended: false },
      });

      await service.recompute('user-1');

      const crossings = emit.mock.calls.filter(
        ([name]) => name === TRUST_SCORE_THRESHOLD_CROSSED,
      ) as [string, TrustScoreThresholdCrossedEvent][];

      expect(crossings.map(([, event]) => event.threshold)).toEqual([25, 50]);
      expect(crossings.every(([, event]) => event.direction === 'UP')).toBe(true);
    });

    it('emits nothing when the score moves within a band', async () => {
      const { service, emit } = makeHarness({
        // 30 → 35, entirely between the 25 and 50 milestones.
        events: log(TrustEventType.ACCOUNT_CREATED, TrustEventType.ID_VERIFIED),
        previous: { total: 30, suspended: false },
      });

      await service.recompute('user-1');

      expect(
        emit.mock.calls.filter(([name]) => name === TRUST_SCORE_THRESHOLD_CROSSED),
      ).toHaveLength(0);
    });

    it('emits no CHANGE events on a repeat recompute with no new events', async () => {
      const { service, emit } = makeHarness({
        events: log(TrustEventType.ACCOUNT_CREATED, TrustEventType.PHONE_VERIFIED),
        previous: { total: 25, suspended: false },
      });

      await service.recompute('user-1');

      // TRUST_RECOMPUTED is deliberately excluded: it announces that the numbers
      // were re-derived, not that anything moved, because a milestone can become
      // true without the score changing (a completed job at a capped sub-score).
      // Its consumers are idempotent. The events that mean "something CHANGED"
      // must still stay silent.
      const changeEvents = emit.mock.calls.filter(([name]) => name !== TRUST_RECOMPUTED);

      expect(changeEvents).toHaveLength(0);
    });

    it('announces every recompute, so badge rules can re-evaluate', async () => {
      const { service, emit } = makeHarness({
        events: log(TrustEventType.ACCOUNT_CREATED, TrustEventType.PHONE_VERIFIED),
        previous: { total: 25, suspended: false },
      });

      await service.recompute('user-1');

      expect(emit.mock.calls.filter(([name]) => name === TRUST_RECOMPUTED)).toHaveLength(1);
    });
  });

  describe('suspension (TRU-08)', () => {
    it('suspends the account, zeroes the score and emits once', async () => {
      const { service, emit, userUpdate, auditCreate } = makeHarness({
        events: log(
          TrustEventType.ACCOUNT_CREATED,
          TrustEventType.ID_VERIFIED,
          TrustEventType.FAKE_DOCUMENTS_CONFIRMED,
        ),
        previous: { total: 35, suspended: false },
      });

      await service.recompute('user-1');

      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { trustScore: 0, status: UserStatus.SUSPENDED },
      });

      const suspensions = emit.mock.calls.filter(([name]) => name === TRUST_SUSPENDED) as [
        string,
        TrustSuspendedEvent,
      ][];
      expect(suspensions).toHaveLength(1);
      expect(suspensions[0]?.[1].reason).toBe('FAKE_DOCUMENTS_CONFIRMED');

      expect(auditCreate).toHaveBeenCalledWith(
        containing({
          data: containing({ action: 'trust.suspended' }),
        }),
      );
    });

    it('does not re-emit or re-audit on a recompute of an already-suspended identity', async () => {
      const { service, emit, auditCreate } = makeHarness({
        events: log(TrustEventType.ACCOUNT_CREATED, TrustEventType.FAKE_DOCUMENTS_CONFIRMED),
        previous: { total: 0, suspended: true },
      });

      await service.recompute('user-1');

      expect(emit.mock.calls.filter(([name]) => name === TRUST_SUSPENDED)).toHaveLength(0);
      expect(auditCreate).not.toHaveBeenCalled();
    });
  });
});

describe('nominalDeltaFor', () => {
  it('reports a milestone’s full value', () => {
    expect(nominalDeltaFor(TrustEventType.ID_VERIFIED)).toBe(20);
  });

  it('reports a penalty as negative', () => {
    expect(nominalDeltaFor(TrustEventType.DISPUTE_UPHELD)).toBe(-20);
  });

  it('reports zero for suspension, which is a verdict rather than an amount', () => {
    expect(nominalDeltaFor(TrustEventType.FAKE_DOCUMENTS_CONFIRMED)).toBe(0);
  });
});
