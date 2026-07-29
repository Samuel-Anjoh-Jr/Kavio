import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  VerificationCheckType,
  VerificationStatus,
  VerificationTier,
} from '@kavio/database';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import {
  deriveTier,
  TIER_ORDER,
  type TierDerivationInput,
  type TierDerivationResult,
  type TierGate,
} from './tier.model';
import { TierChangedEvent, TRUST_TIER_CHANGED } from './trust.events';

const logger = createLogger('trust:tier');

/** How long the gate table is cached. Short: an admin retune must take effect fast. */
const CONFIG_CACHE_TTL_MS = 30_000;

/**
 * Tier derivation and persistence (TRU-02, §21.4).
 *
 * This service is the ONLY writer of `User.tier`, and it has no method that
 * takes a tier as an argument. That is the enforcement behind "never set
 * manually": there is simply no code path that accepts one, so an admin tool, a
 * seed script or a future module cannot grant a tier even by mistake — it can
 * only change the gates in TierConfig and let the derivation follow.
 */
@Injectable()
export class TierService {
  private cachedGates: TierGate[] | null = null;
  private cachedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * The admin-tunable gates (§21.4). Cached briefly because tier derivation runs
   * on every recompute and the table changes perhaps monthly.
   */
  async getGates(): Promise<TierGate[]> {
    if (this.cachedGates && Date.now() - this.cachedAt < CONFIG_CACHE_TTL_MS) {
      return this.cachedGates;
    }

    const rows = await this.prisma.client.tierConfig.findMany({
      select: {
        tier: true,
        minScore: true,
        requiredChecks: true,
        minCompletedJobs: true,
        minAverageRating: true,
      },
    });

    if (rows.length === 0) {
      // The gates are seeded by the trust-engine migration, so an empty table
      // means a database that was not migrated. Deriving from nothing would
      // silently hold every identity at Tier 0, which looks like a product bug
      // rather than the deployment fault it is — so say so, loudly.
      logger.error('TierConfig is empty; every identity will derive to Tier 0', {
        payload: { hint: 'Run prisma migrate deploy — gates are seeded by the migration.' },
      });
    }

    this.cachedGates = rows.map((row) => ({
      tier: row.tier,
      minScore: row.minScore,
      requiredChecks: row.requiredChecks,
      minCompletedJobs: row.minCompletedJobs,
      minAverageRating: toNumber(row.minAverageRating),
    }));
    this.cachedAt = Date.now();

    return this.cachedGates;
  }

  /** Drops the cache. Called by the admin tier-config write path (Phase 5). */
  invalidateGates(): void {
    this.cachedGates = null;
    this.cachedAt = 0;
  }

  /**
   * Which checks currently count as passed: the LATEST attempt per check type,
   * and only when that attempt is VERIFIED. Reading the latest (rather than "any
   * verified row ever") is what makes a revoked or re-submitted check actually
   * take a capability away again (TRU-06).
   */
  async verifiedChecksFor(subjectId: string): Promise<VerificationCheckType[]> {
    const records = await this.prisma.client.verificationRecord.findMany({
      where: { subjectId },
      select: { checkType: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const latestByType = new Map<VerificationCheckType, VerificationStatus>();
    for (const record of records) {
      if (!latestByType.has(record.checkType)) {
        latestByType.set(record.checkType, record.status);
      }
    }

    return [...latestByType.entries()]
      .filter(([, status]) => status === VerificationStatus.VERIFIED)
      .map(([checkType]) => checkType);
  }

  /** Builds the derivation input for an identity from its current trust state. */
  async derivationInputFor(subjectId: string): Promise<TierDerivationInput> {
    const [score, verifiedChecks] = await Promise.all([
      this.prisma.client.trustScore.findUnique({
        where: { subjectId },
        select: {
          total: true,
          completedJobs: true,
          averageRating: true,
          suspended: true,
        },
      }),
      this.verifiedChecksFor(subjectId),
    ]);

    return {
      trustScore: score?.total ?? 0,
      verifiedChecks,
      completedJobs: score?.completedJobs ?? 0,
      averageRating: toNumber(score?.averageRating ?? null),
      suspended: score?.suspended ?? false,
    };
  }

  /** Derives without writing — the read path behind the `tier` query. */
  async deriveFor(subjectId: string): Promise<TierDerivationResult> {
    const [input, gates] = await Promise.all([this.derivationInputFor(subjectId), this.getGates()]);
    return deriveTier(input, gates);
  }

  /**
   * Derives the tier and persists it when it moved, emitting TierChangedEvent so
   * badges and notifications react without the Trust Engine knowing about them.
   *
   * Safe to call on every recompute: an unchanged tier writes nothing and emits
   * nothing, so this is idempotent for the common case.
   */
  async applyDerivedTier(subjectId: string): Promise<TierDerivationResult> {
    const started = Date.now();
    const derived = await this.deriveFor(subjectId);

    const user = await this.prisma.client.user.findUnique({
      where: { id: subjectId },
      select: { tier: true, trustScore: true },
    });

    if (!user) {
      // Recompute can race a deletion; there is nothing to update and nothing
      // worth failing the caller over.
      logger.warn('Tier derivation skipped: identity no longer exists', {
        payload: { subjectId },
      });
      return derived;
    }

    if (user.tier === derived.tier) {
      return derived;
    }

    await this.prisma.client.user.update({
      where: { id: subjectId },
      data: { tier: derived.tier },
    });

    const direction = tierRank(derived.tier) > tierRank(user.tier) ? 'PROMOTED' : 'DEMOTED';

    // Tier movement is a verification event, so it is audited alongside money
    // events rather than living only in the logs (SRS §21, "audit-log every
    // money/verification event").
    await this.prisma.client.auditLog.create({
      data: {
        actorId: null,
        action: 'trust.tier.changed',
        target: `User:${subjectId}`,
        requestId: getRequestId(),
        meta: {
          previousTier: user.tier,
          tier: derived.tier,
          direction,
          trustScore: user.trustScore,
        },
      },
    });

    logger.info('Tier changed', {
      result: { subjectId, previousTier: user.tier, tier: derived.tier, direction },
      durationMs: Date.now() - started,
    });

    this.events.emit(
      TRUST_TIER_CHANGED,
      new TierChangedEvent({
        subjectId,
        previousTier: user.tier,
        tier: derived.tier,
        direction,
        trustScore: user.trustScore,
        requestId: getRequestId(),
      }),
    );

    return derived;
  }
}

/** Position in the ladder, for deciding promotion vs demotion. */
export function tierRank(tier: VerificationTier): number {
  return TIER_ORDER.indexOf(tier);
}

/** Prisma Decimal → number, preserving null. */
function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}
