import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, TrustEventType, TrustPillar, UserStatus } from '@trustpro/database';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { TierService } from './tier.service';
import {
  computeTrustScore,
  crossedThresholds,
  ruleMax,
  subScoreFor,
  TRUST_POINT_MODEL,
  type TrustScoreResult,
} from './trust-score.model';
import {
  TRUST_SCORE_THRESHOLD_CROSSED,
  TRUST_SUSPENDED,
  TrustScoreThresholdCrossedEvent,
  TrustSuspendedEvent,
} from './trust.events';

const logger = createLogger('trust:score');

const FRAUD_SUSPENSION_REASON = 'FAKE_DOCUMENTS_CONFIRMED';

/** What a module records when something trust-relevant happens. */
export interface RecordTrustEventInput {
  readonly subjectId: string;
  readonly type: TrustEventType;
  /** Who caused it. Null/undefined for system events such as ACCOUNT_CREATED. */
  readonly actorId?: string | null;
  /** What it points back at — "Job", "Review", "VerificationRecord". */
  readonly sourceType?: string;
  readonly sourceId?: string;
  readonly metadata?: Prisma.InputJsonValue;
  readonly occurredAt?: Date;
}

/**
 * The write side of the Trust Engine (TRU-01).
 *
 * Modules never compute or adjust a score. They record WHAT HAPPENED and this
 * service replays the ledger through the point model — so the score is always a
 * function of history rather than of whatever the last writer believed, and a
 * change to the rules re-derives every identity with no data migration.
 */
@Injectable()
export class TrustScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiers: TierService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Appends one event to the ledger and recomputes.
   *
   * The recorded `delta` is the rule's NOMINAL impact, kept for the audit trail
   * and the "what changed" UI. It is deliberately not what the score is computed
   * from: caps, tapers and clamping only make sense against the whole log, which
   * is what `recompute` replays.
   */
  async record(input: RecordTrustEventInput): Promise<TrustScoreResult> {
    const rule = TRUST_POINT_MODEL[input.type];
    const pillar = rule.kind === 'SUSPENSION' ? TrustPillar.IDENTITY : rule.pillar;
    const nominalDelta = nominalDeltaFor(input.type);

    await this.prisma.client.trustEvent.create({
      data: {
        subjectId: input.subjectId,
        type: input.type,
        pillar,
        delta: nominalDelta,
        actorId: input.actorId ?? null,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        metadata: input.metadata,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });

    logger.info('Trust event recorded', {
      result: {
        subjectId: input.subjectId,
        type: input.type,
        pillar,
        delta: nominalDelta,
      },
    });

    return this.recompute(input.subjectId);
  }

  /**
   * Replays an identity's whole ledger and persists the snapshot (TRU-01).
   *
   * Idempotent: running it twice with no new events writes the same numbers and
   * emits nothing the second time, because every event fired here is gated on an
   * actual change against the previous snapshot.
   */
  async recompute(subjectId: string): Promise<TrustScoreResult> {
    const started = Date.now();

    const [events, previous] = await Promise.all([
      this.prisma.client.trustEvent.findMany({
        where: { subjectId },
        select: { type: true },
        orderBy: { occurredAt: 'asc' },
      }),
      this.prisma.client.trustScore.findUnique({
        where: { subjectId },
        select: { total: true, suspended: true },
      }),
    ]);

    const result = computeTrustScore(events);
    const previousTotal = previous?.total ?? 0;
    const wasSuspended = previous?.suspended ?? false;

    const snapshot = {
      identityScore: subScoreFor(result, TrustPillar.IDENTITY).points,
      professionalScore: subScoreFor(result, TrustPillar.PROFESSIONAL).points,
      marketplaceScore: subScoreFor(result, TrustPillar.MARKETPLACE).points,
      financialScore: subScoreFor(result, TrustPillar.FINANCIAL).points,
      total: result.total,
      suspended: result.suspended,
      suspensionReason: result.suspended ? FRAUD_SUSPENSION_REASON : null,
      completedJobs: result.completedJobs,
      eventCount: result.eventCount,
      computedAt: new Date(),
    };

    await this.prisma.client.$transaction([
      this.prisma.client.trustScore.upsert({
        where: { subjectId },
        // `averageRating` is owned by the reviews module (Phase 3), so it is
        // absent from both branches: a recompute must never clobber a rating it
        // does not derive.
        create: {
          subjectId,
          ...snapshot,
          suspendedAt: result.suspended ? new Date() : null,
        },
        update: {
          ...snapshot,
          // Set once and left alone, so the original suspension date survives
          // every later recompute.
          ...(result.suspended && !wasSuspended ? { suspendedAt: new Date() } : {}),
        },
      }),
      // Mirrored onto User so the hot read paths (search ranking, profile cards,
      // the JWT tier claim) never need a join.
      this.prisma.client.user.update({
        where: { id: subjectId },
        data: {
          trustScore: result.total,
          ...(result.suspended ? { status: UserStatus.SUSPENDED } : {}),
        },
      }),
    ]);

    const durationMs = Date.now() - started;
    if (durationMs > 300) {
      logger.warn('Trust recompute exceeded the slow-query budget', {
        result: { subjectId, eventCount: result.eventCount },
        durationMs,
      });
    }

    logger.info('Trust score recomputed', {
      result: {
        subjectId,
        total: result.total,
        previousTotal,
        suspended: result.suspended,
        eventCount: result.eventCount,
      },
      durationMs,
    });

    if (result.suspended && !wasSuspended) {
      await this.prisma.client.auditLog.create({
        data: {
          actorId: null,
          action: 'trust.suspended',
          target: `User:${subjectId}`,
          requestId: getRequestId(),
          meta: { reason: FRAUD_SUSPENSION_REASON, previousTotal },
        },
      });

      this.events.emit(
        TRUST_SUSPENDED,
        new TrustSuspendedEvent({
          subjectId,
          reason: FRAUD_SUSPENSION_REASON,
          requestId: getRequestId(),
        }),
      );
    }

    // One event per milestone actually passed, in the direction it was passed.
    for (const threshold of crossedThresholds(previousTotal, result.total)) {
      this.events.emit(
        TRUST_SCORE_THRESHOLD_CROSSED,
        new TrustScoreThresholdCrossedEvent({
          subjectId,
          previousScore: previousTotal,
          score: result.total,
          threshold,
          requestId: getRequestId(),
        }),
      );
    }

    // The tier depends on the score that was just written, so derivation runs
    // after the snapshot lands — never against the numbers it is replacing.
    await this.tiers.applyDerivedTier(subjectId);

    return result;
  }

  /** Reads the stored snapshot, recomputing on the fly if none exists yet. */
  async currentResult(subjectId: string): Promise<TrustScoreResult> {
    const events = await this.prisma.client.trustEvent.findMany({
      where: { subjectId },
      select: { type: true },
      orderBy: { occurredAt: 'asc' },
    });

    return computeTrustScore(events);
  }
}

/**
 * The nominal per-occurrence impact of an event type, for the audit column.
 * Milestones report their full value, accruals their per-occurrence rate,
 * penalties their (negative) charge, and suspension zero — because suspension is
 * a verdict rather than an amount.
 */
export function nominalDeltaFor(type: TrustEventType): number {
  const rule = TRUST_POINT_MODEL[type];

  switch (rule.kind) {
    case 'ONCE':
      return rule.points;
    case 'ACCRUAL':
    case 'TAPERED_ACCRUAL':
      return Math.round(rule.pointsPer);
    case 'PENALTY':
      return rule.pointsPer;
    case 'SUSPENSION':
      return 0;
  }
}

/** Re-exported so consumers can size a progress ring without the model import. */
export { ruleMax };
