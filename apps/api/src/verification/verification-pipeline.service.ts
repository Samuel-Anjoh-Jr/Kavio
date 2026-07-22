import { Injectable } from '@nestjs/common';
import {
  VerificationStage,
  VerificationStatus,
  type VerificationCheckType,
} from '@trustpro/database';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import {
  approvalRate,
  averageReviewMinutes,
  checkTypesForGroup,
  PIPELINE_STAGES,
  type VerificationQueueGroup,
} from './verification.model';

const logger = createLogger('verification:pipeline');

export interface PipelineStageCount {
  readonly stage: VerificationStage;
  readonly count: number;
}

export interface PipelineMetrics {
  readonly stages: readonly PipelineStageCount[];
  readonly pending: number;
  readonly approved: number;
  readonly rejected: number;
  /** Null until something has actually been decided. */
  readonly averageReviewMinutes: number | null;
  /** 0–1, or null when nothing has been decided. */
  readonly approvalRate: number | null;
  readonly windowDays: number;
}

/** How far back the throughput metrics look, unless a caller says otherwise. */
const DEFAULT_WINDOW_DAYS = 30;

/** Page size ceiling for the queue. Prevents an unbounded scan of the board. */
const MAX_QUEUE_PAGE = 100;

/**
 * Pipeline reads for the agent/admin surfaces (P29; AGT-02, AGT-03).
 *
 * The counts are per STAGE and the rates are over DECIDED items in a window —
 * an all-time approval rate stops moving after a few months and quietly becomes
 * useless as an operational signal.
 */
@Injectable()
export class VerificationPipelineService {
  constructor(private readonly prisma: PrismaService) {}

  /** Per-stage counts, average review time and approval rate (AGT-03). */
  async metrics(windowDays: number = DEFAULT_WINDOW_DAYS): Promise<PipelineMetrics> {
    const started = Date.now();
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [stageGroups, decided] = await Promise.all([
      // One grouped query rather than a count per column — six round-trips to
      // paint six numbers is the N+1 the standards forbid, just wearing a hat.
      this.prisma.client.verificationRecord.groupBy({
        by: ['stage'],
        _count: { _all: true },
      }),
      this.prisma.client.verificationRecord.findMany({
        where: {
          reviewedAt: { not: null, gte: since },
          status: { in: [VerificationStatus.VERIFIED, VerificationStatus.REJECTED] },
        },
        select: { status: true, submittedAt: true, reviewedAt: true },
      }),
    ]);

    const countByStage = new Map(stageGroups.map((group) => [group.stage, group._count._all]));

    const approved = decided.filter((item) => item.status === VerificationStatus.VERIFIED).length;
    const rejected = decided.length - approved;

    const durationMs = Date.now() - started;
    if (durationMs > 300) {
      logger.warn('Pipeline metrics exceeded the slow-query budget', {
        result: { windowDays, decidedCount: decided.length },
        durationMs,
      });
    }

    return {
      // Every stage is present even at zero: a board column that disappears when
      // it empties makes the pipeline look like it has fewer steps than it does.
      stages: PIPELINE_STAGES.map((stage) => ({
        stage,
        count: countByStage.get(stage) ?? 0,
      })),
      pending: [
        VerificationStage.SUBMITTED,
        VerificationStage.UNDER_REVIEW,
        VerificationStage.FIELD_CHECK,
        VerificationStage.PENDING_APPROVAL,
      ].reduce((sum, stage) => sum + (countByStage.get(stage) ?? 0), 0),
      approved,
      rejected,
      averageReviewMinutes: averageReviewMinutes(decided),
      approvalRate: approvalRate(approved, rejected),
      windowDays,
    };
  }

  /**
   * One column of the board, oldest first — the queue is worked FIFO (AGT-03,
   * ADM-03).
   *
   * `group` is the ADM-03 tab (All/ID/Business/Field); `checkType` narrows within
   * it. When both are given the check type must belong to the group, otherwise
   * the two filters contradict and the honest answer is an empty column — so a
   * checkType outside the selected group returns nothing rather than silently
   * winning over the tab the admin clicked.
   */
  async queue(options: {
    stage?: VerificationStage;
    group?: VerificationQueueGroup;
    checkType?: VerificationCheckType;
    assignedToId?: string;
    limit?: number;
    offset?: number;
  }) {
    const take = Math.min(options.limit ?? 25, MAX_QUEUE_PAGE);
    const groupTypes = options.group ? checkTypesForGroup(options.group) : null;

    // Resolve the tab and the explicit check-type into one `checkType IN (...)`
    // filter, honouring both: a checkType outside the tab collapses to an empty
    // set rather than overriding the tab.
    const checkTypeFilter = this.resolveCheckTypeFilter(groupTypes, options.checkType);

    return this.prisma.client.verificationRecord.findMany({
      where: {
        ...(options.stage ? { stage: options.stage } : { status: VerificationStatus.PENDING }),
        ...(checkTypeFilter ? { checkType: checkTypeFilter } : {}),
        ...(options.assignedToId ? { assignedToId: options.assignedToId } : {}),
      },
      select: {
        id: true,
        subjectId: true,
        checkType: true,
        status: true,
        stage: true,
        attempt: true,
        assignedToId: true,
        submittedAt: true,
        stageUpdatedAt: true,
        infoRequest: true,
        // Selected, never included wholesale: the reviewer needs the subject's
        // name and tier, not their password hash and every relation they own.
        subject: { select: { id: true, name: true, tier: true, trustScore: true } },
        documents: { select: { mediaAssetId: true } },
      },
      orderBy: { submittedAt: 'asc' },
      take,
      skip: options.offset ?? 0,
    });
  }

  /**
   * Combines the tab's check types with an explicit one into a single Prisma
   * `checkType` filter.
   *
   * Returns `{ in: [] }` when the explicit type is outside the tab: an empty
   * `IN` matches no rows, which is the correct answer to "Business tab, but show
   * me an ID check" — the two filters genuinely intersect to nothing.
   */
  private resolveCheckTypeFilter(
    groupTypes: readonly VerificationCheckType[] | null,
    checkType?: VerificationCheckType,
  ): { in: VerificationCheckType[] } | VerificationCheckType | undefined {
    if (checkType && groupTypes && !groupTypes.includes(checkType)) {
      return { in: [] };
    }
    if (checkType) {
      return checkType;
    }
    if (groupTypes) {
      return { in: [...groupTypes] };
    }
    return undefined;
  }
}
