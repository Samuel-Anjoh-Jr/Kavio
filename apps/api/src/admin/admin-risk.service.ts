import { Injectable } from '@nestjs/common';
import {
  AbuseReportStatus,
  DisputeFaultParty,
  DisputeStatus,
  ModerationActionType,
  Prisma,
  UserStatus,
} from '@kavio/database';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { riskLevel, riskRank } from './risk-level.model';
import type {
  ActivityCellView,
  AdminRiskView,
  BlockedAccountView,
  RiskAccountView,
  RiskSignalView,
  SuspiciousJobView,
} from './models/admin-risk.model';

const logger = createLogger('admin:risk');

/** A Trust Score at or below this is a signal on its own (§21.4 banding). */
const LOW_TRUST_THRESHOLD = 30;

/** Lists are for triage, not for bulk export. Bounded hard. */
const LIST_LIMIT = 25;

/**
 * Heatmap cell size in degrees. ~0.01° is roughly a kilometre at this latitude —
 * coarse enough that a cell is a neighbourhood rather than an address.
 */
const HEATMAP_CELL_DEGREES = 0.01;

/**
 * A cell must contain at least this many jobs to be emitted.
 *
 * This is the privacy control, not a tidiness one. A heat cell containing a
 * single job is a map pin on one person's home, published to every admin
 * session and cached wherever the response goes. Aggregate layers must be
 * genuinely aggregate or they are a location disclosure with a blur filter.
 */
const MIN_CELL_JOBS = 3;

/**
 * The Fraud & Risk monitor (ADM-06). GraphQL reads per the DUAL API RULE.
 *
 * Nothing here is persisted. Every risk level is recomputed from the underlying
 * facts on each read — see the note on the model file for why a stored risk
 * score is a thing this codebase deliberately does not have.
 *
 * The lists are ranked so that the accounts with the most independent signals
 * reach a human first. They are candidates for review, and the admin acting on
 * one does so through the existing moderation surface, which writes an
 * append-only ModerationAction with a reason and notifies the party.
 */
@Injectable()
export class AdminRiskService {
  constructor(private readonly prisma: PrismaService) {}

  async monitor(windowDays: number): Promise<AdminRiskView> {
    const started = Date.now();
    const since = new Date(Date.now() - windowDays * 86_400_000);

    const [highRiskAccounts, suspiciousJobs, blockedAccounts, openReports] = await Promise.all([
      this.highRiskAccounts(),
      this.suspiciousJobs(since),
      this.blockedAccounts(),
      this.prisma.client.abuseReport.count({
        where: { status: { in: [AbuseReportStatus.OPEN, AbuseReportStatus.REVIEWING] } },
      }),
    ]);

    const durationMs = Date.now() - started;
    if (durationMs > 300) {
      logger.warn('Risk monitor exceeded the slow-query budget', {
        result: { windowDays },
        durationMs,
      });
    }

    return { windowDays, highRiskAccounts, suspiciousJobs, blockedAccounts, openReports };
  }

  /**
   * Accounts carrying at least one risk signal, worst first.
   *
   * One query per SIGNAL, then a join in memory — not one query per candidate
   * account. Four bounded aggregate scans is the shape that stays flat as the
   * platform grows; the alternative walks a list of users and asks four
   * questions about each, which is the N+1 the standards forbid.
   */
  private async highRiskAccounts(): Promise<RiskAccountView[]> {
    const [suspendedTrust, lowTrust, lostDisputes, openReports, moderated, blockedBy] =
      await Promise.all([
        this.prisma.client.trustScore.findMany({
          where: { suspended: true },
          select: { subjectId: true },
        }),
        this.prisma.client.trustScore.findMany({
          where: { suspended: false, total: { lte: LOW_TRUST_THRESHOLD } },
          select: { subjectId: true },
          // Bounded: on a young platform almost everyone is under the threshold,
          // and "everyone is high risk" is the same as no signal at all.
          take: 200,
        }),
        this.prisma.client.dispute.groupBy({
          by: ['openedById'],
          where: {
            status: DisputeStatus.RESOLVED,
            faultParty: { not: DisputeFaultParty.NONE },
          },
          _count: { _all: true },
        }),
        this.prisma.client.abuseReport.groupBy({
          by: ['reportedUserId'],
          where: { status: { in: [AbuseReportStatus.OPEN, AbuseReportStatus.REVIEWING] } },
          _count: { _all: true },
        }),
        this.prisma.client.moderationAction.groupBy({
          by: ['subjectUserId'],
          _count: { _all: true },
        }),
        this.prisma.client.block.groupBy({
          by: ['blockedId'],
          _count: { _all: true },
        }),
      ]);

    const signals = new Map<string, RiskSignalView[]>();
    const add = (userId: string | null, code: string, count: number) => {
      if (!userId || count <= 0) return;
      const list = signals.get(userId) ?? [];
      list.push({ code, count });
      signals.set(userId, list);
    };

    for (const row of suspendedTrust) add(row.subjectId, 'TRUST_SUSPENDED', 1);
    for (const row of lowTrust) add(row.subjectId, 'LOW_TRUST', 1);
    for (const row of lostDisputes) add(row.openedById, 'DISPUTES_LOST', row._count._all);
    for (const row of openReports) add(row.reportedUserId, 'OPEN_REPORTS', row._count._all);
    for (const row of moderated) add(row.subjectUserId, 'MODERATION_HISTORY', row._count._all);
    // Being blocked by several DIFFERENT users is a signal; being blocked by one
    // is a falling-out. The threshold is what separates the two.
    for (const row of blockedBy) {
      if (row._count._all >= 3) add(row.blockedId, 'BLOCKED_BY_USERS', row._count._all);
    }

    if (signals.size === 0) return [];

    const candidateIds = [...signals.keys()];

    const users = await this.prisma.client.user.findMany({
      where: { id: { in: candidateIds }, status: { not: UserStatus.DELETED } },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        trustScoreRecord: { select: { total: true, suspended: true } },
        moderationAgainst: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    return users
      .map((user) => {
        const userSignals = signals.get(user.id) ?? [];
        if (user.status === UserStatus.SUSPENDED) {
          userSignals.push({ code: 'ACCOUNT_SUSPENDED', count: 1 });
        }

        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status,
          trustScore: user.trustScoreRecord?.total ?? 0,
          trustSuspended: user.trustScoreRecord?.suspended ?? false,
          signals: userSignals,
          level: riskLevel(userSignals),
          createdAt: user.createdAt,
          lastActionAt: user.moderationAgainst[0]?.createdAt ?? null,
        };
      })
      .sort((a, b) => riskRank(b) - riskRank(a))
      .slice(0, LIST_LIMIT);
  }

  /**
   * Jobs worth a second look (ADM-06).
   *
   * The signals are deliberately behavioural rather than content-based: a job
   * that people reported, a job whose escrow ended in dispute, a job posted by
   * somebody whose Trust Score is suspended. Guessing at "suspicious wording"
   * would be a text classifier nobody validated, quietly penalising people who
   * write in their second language on a bilingual platform.
   */
  private async suspiciousJobs(since: Date): Promise<SuspiciousJobView[]> {
    const [reported, disputed] = await Promise.all([
      this.prisma.client.abuseReport.groupBy({
        by: ['targetId'],
        where: {
          targetType: 'JOB',
          status: { in: [AbuseReportStatus.OPEN, AbuseReportStatus.REVIEWING] },
        },
        _count: { _all: true },
      }),
      this.prisma.client.dispute.groupBy({
        by: ['jobId'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const signals = new Map<string, RiskSignalView[]>();
    const add = (jobId: string, code: string, count: number) => {
      const list = signals.get(jobId) ?? [];
      list.push({ code, count });
      signals.set(jobId, list);
    };

    for (const row of reported) add(row.targetId, 'OPEN_REPORTS', row._count._all);
    for (const row of disputed) add(row.jobId, 'DISPUTED', row._count._all);

    if (signals.size === 0) return [];

    const jobs = await this.prisma.client.job.findMany({
      where: { id: { in: [...signals.keys()] } },
      select: {
        id: true,
        title: true,
        status: true,
        budgetMax: true,
        createdAt: true,
        posterId: true,
        poster: {
          select: { name: true, trustScoreRecord: { select: { suspended: true } } },
        },
      },
    });

    return jobs
      .map((job) => {
        const jobSignals = signals.get(job.id) ?? [];
        if (job.poster.trustScoreRecord?.suspended) {
          jobSignals.push({ code: 'POSTER_TRUST_SUSPENDED', count: 1 });
        }

        return {
          jobId: job.id,
          title: job.title,
          posterId: job.posterId,
          posterName: job.poster.name,
          status: job.status,
          budgetMax: job.budgetMax,
          signals: jobSignals,
          level: riskLevel(jobSignals),
          createdAt: job.createdAt,
        };
      })
      .sort((a, b) => riskRank(b) - riskRank(a))
      .slice(0, LIST_LIMIT);
  }

  /**
   * Accounts moderation has suspended or banned (ADM-06).
   *
   * Read from the append-only ModerationAction trail rather than from
   * `User.status`, because the status column says THAT an account is suspended
   * and the trail says why, by whom, and until when. An admin reviewing blocks
   * needs all four, and only one of those four lives on the user row.
   */
  private async blockedAccounts(): Promise<BlockedAccountView[]> {
    const actions = await this.prisma.client.moderationAction.findMany({
      where: { action: { in: [ModerationActionType.SUSPEND, ModerationActionType.BAN] } },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      select: {
        action: true,
        reason: true,
        expiresAt: true,
        createdAt: true,
        actorId: true,
        actor: { select: { name: true } },
        subjectUserId: true,
        subject: { select: { name: true, status: true } },
      },
    });

    return actions.map((action) => ({
      userId: action.subjectUserId,
      name: action.subject.name,
      status: action.subject.status,
      action: action.action,
      reason: action.reason,
      actorId: action.actorId,
      actorName: action.actor?.name ?? null,
      expiresAt: action.expiresAt,
      createdAt: action.createdAt,
    }));
  }

  /**
   * The platform activity heatmap (ADM-06).
   *
   * PostGIS does the spatial maths and returns aggregated cells; Mapbox only
   * draws them. That is the stack rule, and it is also what keeps this honest —
   * snapping to a grid in SQL means the raw coordinates never leave the
   * database, whereas shipping points to the client to be clustered in the
   * browser would publish every job's exact position to anyone who opened
   * devtools.
   *
   * Cells below MIN_CELL_JOBS are dropped entirely. See the constant.
   */
  async activityHeatmap(windowDays: number): Promise<ActivityCellView[]> {
    const since = new Date(Date.now() - windowDays * 86_400_000);

    const rows = await this.prisma.client.$queryRaw<
      { latitude: number; longitude: number; jobCount: bigint }[]
    >(
      Prisma.sql`
        SELECT
          ST_Y(ST_Centroid(ST_Collect(location::geometry)))::float8 AS latitude,
          ST_X(ST_Centroid(ST_Collect(location::geometry)))::float8 AS longitude,
          COUNT(*)::bigint AS "jobCount"
        FROM "Job"
        WHERE location IS NOT NULL
          AND "status" <> 'DRAFT'
          AND "createdAt" >= ${since}
        GROUP BY ST_SnapToGrid(location::geometry, ${HEATMAP_CELL_DEGREES}, ${HEATMAP_CELL_DEGREES})
        HAVING COUNT(*) >= ${MIN_CELL_JOBS}
        ORDER BY "jobCount" DESC
        LIMIT 2000
      `,
    );

    const busiest = rows.reduce((max, row) => Math.max(max, Number(row.jobCount)), 0);

    return rows.map((row) => ({
      latitude: row.latitude,
      longitude: row.longitude,
      jobCount: Number(row.jobCount),
      // Relative to the busiest cell, so the ramp uses its full range whatever
      // the absolute volumes are.
      intensity: busiest === 0 ? 0 : Number((Number(row.jobCount) / busiest).toFixed(4)),
    }));
  }
}
