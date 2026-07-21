import {
  Role,
  TrustEventType,
  TrustPillar,
  UserStatus,
  VerificationTier,
} from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import type { PrismaService } from '../prisma/prisma.service';
import type { TierService } from './tier.service';
import type { TrustScoreService } from './trust-score.service';
import { computeTrustScore } from './trust-score.model';
import { TrustService } from './trust.service';

const SUBJECT = 'worker-1';

const viewer = (overrides: Partial<AuthenticatedUser>): AuthenticatedUser => ({
  id: 'someone-else',
  activeRole: Role.CLIENT,
  roles: [Role.CLIENT],
  tier: VerificationTier.TIER_0,
  status: UserStatus.ACTIVE,
  sessionId: 'session-1',
  ...overrides,
});

function makeHarness(options: {
  subjectExists?: boolean;
  events?: TrustEventType[];
  tier?: VerificationTier;
  nextTier?: VerificationTier | null;
}) {
  const prisma = {
    client: {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue(options.subjectExists === false ? null : { id: SUBJECT }),
      },
    },
  } as unknown as PrismaService;

  const result = computeTrustScore((options.events ?? []).map((type) => ({ type })));
  const scores = {
    currentResult: jest.fn().mockResolvedValue(result),
  } as unknown as TrustScoreService;

  const tiers = {
    deriveFor: jest.fn().mockResolvedValue({
      tier: options.tier ?? VerificationTier.TIER_0,
      nextTier: options.nextTier === undefined ? VerificationTier.TIER_1 : options.nextTier,
      unmet: [],
    }),
  } as unknown as TierService;

  return { service: new TrustService(prisma, scores, tiers) };
}

describe('TrustService reads (TRU-01, TRU-04)', () => {
  describe('trustScore', () => {
    it('returns the score and the derived tier', async () => {
      const { service } = makeHarness({
        events: [TrustEventType.ACCOUNT_CREATED, TrustEventType.PHONE_VERIFIED],
        tier: VerificationTier.TIER_1,
      });

      const view = await service.trustScore(SUBJECT);

      expect(view.subjectId).toBe(SUBJECT);
      expect(view.total).toBe(25);
      expect(view.tier).toBe(VerificationTier.TIER_1);
      expect(view.suspended).toBe(false);
    });

    it('404s for an identity that does not exist', async () => {
      const { service } = makeHarness({ subjectExists: false });
      await expect(service.trustScore('nobody')).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('tierStatus', () => {
    it('never marks Tier 0 as verified (TRU-03)', async () => {
      const { service } = makeHarness({ tier: VerificationTier.TIER_0 });
      const status = await service.tierStatus(SUBJECT);

      expect(status.verified).toBe(false);
      expect(status.labelKey).toBe('Trust.tier.TIER_0');
    });

    it('marks a verified tier as verified', async () => {
      const { service } = makeHarness({ tier: VerificationTier.TIER_2 });
      const status = await service.tierStatus(SUBJECT);

      expect(status.verified).toBe(true);
      expect(status.labelKey).toBe('Trust.tier.TIER_2');
    });
  });

  describe('trustBreakdown', () => {
    const events = [
      TrustEventType.ACCOUNT_CREATED,
      TrustEventType.PHONE_VERIFIED,
      TrustEventType.PORTFOLIO_ADDED,
    ];

    it('returns all four pillars with their itemised inputs', async () => {
      const { service } = makeHarness({ events });
      const breakdown = await service.trustBreakdown(SUBJECT, undefined);

      expect(breakdown.subScores.map((sub) => sub.pillar)).toEqual([
        TrustPillar.IDENTITY,
        TrustPillar.PROFESSIONAL,
        TrustPillar.MARKETPLACE,
        TrustPillar.FINANCIAL,
      ]);

      const identity = breakdown.subScores[0]!;
      expect(identity.points).toBe(25);
      expect(identity.max).toBe(45);
      expect(identity.contributions.length).toBeGreaterThan(0);
    });

    it('flags the Financial pillar as unscored until escrow ships', async () => {
      const { service } = makeHarness({ events });
      const breakdown = await service.trustBreakdown(SUBJECT, undefined);

      const financial = breakdown.subScores.find((sub) => sub.pillar === TrustPillar.FINANCIAL);
      expect(financial?.scored).toBe(false);
      expect(financial?.max).toBe(0);
    });

    it('gives an i18n key for an unearned signal and none for a maxed one', async () => {
      const { service } = makeHarness({ events });
      const breakdown = await service.trustBreakdown(SUBJECT, viewer({ id: SUBJECT }));

      const identity = breakdown.subScores[0]!;
      const phone = identity.contributions.find((c) => c.type === TrustEventType.PHONE_VERIFIED);
      const id = identity.contributions.find((c) => c.type === TrustEventType.ID_VERIFIED);

      expect(phone?.maxed).toBe(true);
      expect(phone?.improvementKey).toBeNull();
      expect(id?.maxed).toBe(false);
      expect(id?.improvementKey).toBe('Trust.improve.ID_VERIFIED');
    });

    it('never offers "improvement" advice for a penalty', async () => {
      const { service } = makeHarness({
        events: [...events, TrustEventType.DISPUTE_UPHELD],
      });
      const breakdown = await service.trustBreakdown(SUBJECT, viewer({ id: SUBJECT }));

      expect(breakdown.improvements?.some((c) => c.type === TrustEventType.DISPUTE_UPHELD)).toBe(
        false,
      );
    });

    describe('who may see the improvement list', () => {
      it('withholds it from an anonymous visitor', async () => {
        const { service } = makeHarness({ events });
        const breakdown = await service.trustBreakdown(SUBJECT, undefined);
        expect(breakdown.improvements).toBeNull();
      });

      it('withholds it from another signed-in user', async () => {
        const { service } = makeHarness({ events });
        const breakdown = await service.trustBreakdown(SUBJECT, viewer({}));
        expect(breakdown.improvements).toBeNull();
      });

      it('shows it to the subject themselves', async () => {
        const { service } = makeHarness({ events });
        const breakdown = await service.trustBreakdown(SUBJECT, viewer({ id: SUBJECT }));
        expect(breakdown.improvements).not.toBeNull();
      });

      it.each([Role.ADMIN, Role.AGENT])('shows it to staff acting as %s', async (role) => {
        const { service } = makeHarness({ events });
        const breakdown = await service.trustBreakdown(SUBJECT, viewer({ activeRole: role }));
        expect(breakdown.improvements).not.toBeNull();
      });
    });

    it('ranks improvements by the points still available', async () => {
      const { service } = makeHarness({ events: [TrustEventType.ACCOUNT_CREATED] });
      const breakdown = await service.trustBreakdown(SUBJECT, viewer({ id: SUBJECT }));

      // ID verification (+20) is the biggest single win available, so it leads.
      expect(breakdown.improvements?.[0]?.type).toBe(TrustEventType.ID_VERIFIED);
    });

    it('still exposes the public score for a suspended identity, flagged as such', async () => {
      const { service } = makeHarness({
        events: [...events, TrustEventType.FAKE_DOCUMENTS_CONFIRMED],
      });
      const breakdown = await service.trustBreakdown(SUBJECT, undefined);

      expect(breakdown.suspended).toBe(true);
      expect(breakdown.total).toBe(0);
    });
  });
});
