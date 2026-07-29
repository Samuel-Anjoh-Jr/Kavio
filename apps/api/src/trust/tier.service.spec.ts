import { VerificationCheckType, VerificationStatus, VerificationTier } from '@kavio/database';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../prisma/prisma.service';
import { TierService } from './tier.service';
import { TierChangedEvent, TRUST_TIER_CHANGED } from './trust.events';

/** The gates as the migration seeds them, returned by the fake TierConfig table. */
const GATE_ROWS = [
  {
    tier: VerificationTier.TIER_0,
    minScore: 0,
    requiredChecks: [],
    minCompletedJobs: null,
    minAverageRating: null,
  },
  {
    tier: VerificationTier.TIER_1,
    minScore: 0,
    requiredChecks: [VerificationCheckType.PHONE, VerificationCheckType.ID_SUBMITTED],
    minCompletedJobs: null,
    minAverageRating: null,
  },
  {
    tier: VerificationTier.TIER_2,
    minScore: 0,
    requiredChecks: [VerificationCheckType.ID_APPROVED, VerificationCheckType.PORTFOLIO],
    minCompletedJobs: null,
    minAverageRating: null,
  },
  {
    tier: VerificationTier.TIER_3,
    minScore: 0,
    requiredChecks: [VerificationCheckType.FIELD_VERIFICATION],
    minCompletedJobs: 20,
    minAverageRating: 4.8,
  },
];

interface FakeOptions {
  user?: { tier: VerificationTier; trustScore: number } | null;
  verifications?: {
    checkType: VerificationCheckType;
    status: VerificationStatus;
    createdAt: Date;
  }[];
  score?: {
    total: number;
    completedJobs: number;
    averageRating: number | null;
    suspended: boolean;
  } | null;
  gates?: typeof GATE_ROWS;
}

function makeHarness(options: FakeOptions) {
  const userUpdate = jest.fn().mockResolvedValue({});
  const auditCreate = jest.fn().mockResolvedValue({});
  const gatesFindMany = jest.fn().mockResolvedValue(options.gates ?? GATE_ROWS);

  const prisma = {
    client: {
      tierConfig: { findMany: gatesFindMany },
      verificationRecord: {
        findMany: jest.fn().mockResolvedValue(options.verifications ?? []),
      },
      trustScore: {
        findUnique: jest.fn().mockResolvedValue(options.score ?? null),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            options.user === undefined
              ? { tier: VerificationTier.TIER_0, trustScore: 0 }
              : options.user,
          ),
        update: userUpdate,
      },
      auditLog: { create: auditCreate },
    },
  } as unknown as PrismaService;

  const emit = jest.fn();
  const events = { emit } as unknown as EventEmitter2;

  return {
    service: new TierService(prisma, events),
    emit,
    userUpdate,
    auditCreate,
    gatesFindMany,
  };
}

/** See the note in trust-score.service.spec.ts — objectContaining is typed `any`. */
const containing = (value: Record<string, unknown>): object =>
  expect.objectContaining(value) as object;

const verified = (checkType: VerificationCheckType, createdAt = new Date('2026-01-01')) => ({
  checkType,
  status: VerificationStatus.VERIFIED,
  createdAt,
});

describe('TierService', () => {
  describe('verifiedChecksFor', () => {
    it('counts only the LATEST attempt per check type', async () => {
      // A check that was verified and then re-submitted is pending again — the
      // capability it unlocked has to go away with it.
      const { service } = makeHarness({
        verifications: [
          {
            checkType: VerificationCheckType.ID_APPROVED,
            status: VerificationStatus.PENDING,
            createdAt: new Date('2026-03-01'),
          },
          verified(VerificationCheckType.ID_APPROVED, new Date('2026-01-01')),
          verified(VerificationCheckType.PHONE, new Date('2026-01-01')),
        ],
      });

      await expect(service.verifiedChecksFor('user-1')).resolves.toEqual([
        VerificationCheckType.PHONE,
      ]);
    });

    it('ignores a rejected latest attempt', async () => {
      const { service } = makeHarness({
        verifications: [
          {
            checkType: VerificationCheckType.PHONE,
            status: VerificationStatus.REJECTED,
            createdAt: new Date('2026-03-01'),
          },
        ],
      });

      await expect(service.verifiedChecksFor('user-1')).resolves.toEqual([]);
    });
  });

  describe('applyDerivedTier', () => {
    it('persists the new tier and emits TierChangedEvent on a promotion', async () => {
      const { service, emit, userUpdate, auditCreate } = makeHarness({
        user: { tier: VerificationTier.TIER_0, trustScore: 35 },
        verifications: [
          verified(VerificationCheckType.PHONE),
          verified(VerificationCheckType.ID_SUBMITTED),
        ],
        score: { total: 35, completedJobs: 0, averageRating: null, suspended: false },
      });

      const result = await service.applyDerivedTier('user-1');

      expect(result.tier).toBe(VerificationTier.TIER_1);
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { tier: VerificationTier.TIER_1 },
      });

      expect(emit).toHaveBeenCalledTimes(1);
      const [eventName, event] = emit.mock.calls[0] as [string, TierChangedEvent];
      expect(eventName).toBe(TRUST_TIER_CHANGED);
      expect(event).toBeInstanceOf(TierChangedEvent);
      expect(event.subjectId).toBe('user-1');
      expect(event.previousTier).toBe(VerificationTier.TIER_0);
      expect(event.tier).toBe(VerificationTier.TIER_1);
      expect(event.direction).toBe('PROMOTED');

      // Verification events are audited, not merely logged.
      expect(auditCreate).toHaveBeenCalledWith(
        containing({
          data: containing({ action: 'trust.tier.changed' }),
        }),
      );
    });

    it('marks a downward move as a demotion', async () => {
      const { service, emit } = makeHarness({
        user: { tier: VerificationTier.TIER_3, trustScore: 40 },
        verifications: [verified(VerificationCheckType.PHONE)],
        score: { total: 40, completedJobs: 0, averageRating: null, suspended: false },
      });

      await service.applyDerivedTier('user-1');

      const [, event] = emit.mock.calls[0] as [string, TierChangedEvent];
      expect(event.direction).toBe('DEMOTED');
      expect(event.tier).toBe(VerificationTier.TIER_0);
    });

    it('writes nothing and emits nothing when the tier is unchanged', async () => {
      // Recompute runs on every trust event, so the no-change path is the common
      // one and must stay silent — otherwise every job completion pages the user.
      const { service, emit, userUpdate, auditCreate } = makeHarness({
        user: { tier: VerificationTier.TIER_1, trustScore: 35 },
        verifications: [
          verified(VerificationCheckType.PHONE),
          verified(VerificationCheckType.ID_SUBMITTED),
        ],
        score: { total: 35, completedJobs: 0, averageRating: null, suspended: false },
      });

      await service.applyDerivedTier('user-1');

      expect(userUpdate).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('is idempotent across repeated recomputes', async () => {
      const { service, emit, userUpdate } = makeHarness({
        user: { tier: VerificationTier.TIER_1, trustScore: 35 },
        verifications: [
          verified(VerificationCheckType.PHONE),
          verified(VerificationCheckType.ID_SUBMITTED),
        ],
        score: { total: 35, completedJobs: 0, averageRating: null, suspended: false },
      });

      await service.applyDerivedTier('user-1');
      await service.applyDerivedTier('user-1');
      await service.applyDerivedTier('user-1');

      expect(userUpdate).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('does not throw when the identity was deleted mid-recompute', async () => {
      const { service, emit, userUpdate } = makeHarness({ user: null });

      await expect(service.applyDerivedTier('gone')).resolves.toBeDefined();
      expect(userUpdate).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('the tier cannot be set by hand', () => {
    it('exposes no method that accepts a tier', () => {
      const { service } = makeHarness({});
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));

      // Every writer of User.tier lives behind applyDerivedTier, which takes an
      // identity and derives. If a "setTier" ever appears here, this fails.
      expect(methods.sort()).toEqual(
        [
          'constructor',
          'getGates',
          'invalidateGates',
          'verifiedChecksFor',
          'derivationInputFor',
          'deriveFor',
          'applyDerivedTier',
        ].sort(),
      );
    });

    it('takes only an identity, never a target tier', () => {
      // Inspects the method's arity and never calls it, so there is no `this`
      // to bind — which is the one case unbound-method is not warning about.

      const applyDerivedTier = TierService.prototype.applyDerivedTier;
      expect(applyDerivedTier).toHaveLength(1);
    });
  });

  describe('admin-tunable gates', () => {
    it('reads every threshold from TierConfig rather than from literals', async () => {
      const { service, gatesFindMany } = makeHarness({
        gates: GATE_ROWS.map((gate) =>
          gate.tier === VerificationTier.TIER_1 ? { ...gate, minScore: 90 } : gate,
        ),
        user: { tier: VerificationTier.TIER_0, trustScore: 35 },
        verifications: [
          verified(VerificationCheckType.PHONE),
          verified(VerificationCheckType.ID_SUBMITTED),
        ],
        score: { total: 35, completedJobs: 0, averageRating: null, suspended: false },
      });

      const result = await service.deriveFor('user-1');

      expect(gatesFindMany).toHaveBeenCalled();
      // The checks pass but the admin-raised score gate does not.
      expect(result.tier).toBe(VerificationTier.TIER_0);
    });

    it('caches the gate table, then re-reads it after invalidation', async () => {
      const { service, gatesFindMany } = makeHarness({});

      await service.getGates();
      await service.getGates();
      expect(gatesFindMany).toHaveBeenCalledTimes(1);

      service.invalidateGates();
      await service.getGates();
      expect(gatesFindMany).toHaveBeenCalledTimes(2);
    });
  });
});
