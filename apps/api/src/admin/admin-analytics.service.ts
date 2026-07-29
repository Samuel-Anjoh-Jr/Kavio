import { Injectable } from '@nestjs/common';
import {
  DisputeStatus,
  EscrowState,
  JobStatus,
  NotificationStatus,
  Prisma,
  Role,
  SOSStatus,
  TransactionStatus,
  TransactionType,
  UserStatus,
  VerificationTier,
} from '@kavio/database';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import {
  dayKey,
  densify,
  kpi,
  toSlices,
  windowRange,
  type WindowRange,
} from './admin-metrics.model';
import type {
  AdminAnalyticsView,
  AdminDashboardView,
  BreakdownSliceView,
  DisputeOverviewView,
  EscrowOverviewView,
  KpiView,
  SosOverviewView,
  SystemHealthView,
  TimeSeriesView,
  TopPerformerView,
} from './models/admin-analytics.model';

const logger = createLogger('admin:analytics');

/** Windows an operator actually reasons in. Anything else is rejected upstream. */
export const ALLOWED_WINDOW_DAYS = [7, 30, 90, 365] as const;

/** How long a Campay-backed transaction may sit PENDING before it is a problem. */
const STALE_PENDING_MINUTES = 30;

/** Top-performer lists are a leaderboard, not a report. Bounded hard. */
const TOP_PERFORMER_LIMIT = 10;

/**
 * Platform analytics for the admin dashboard and the reports screen
 * (ADM-01, ADM-07). GraphQL reads per the DUAL API RULE.
 *
 * ── Two rules everything below obeys ────────────────────────────────────────
 *
 * A metric that has not been measured is NULL, never zero. "No completed jobs
 * yet" and "average job value of 0 XAF" are different facts, and an operator
 * cannot tell them apart once the second has been written onto a chart.
 *
 * A delta against an empty previous window is NULL, never +100%. Growth from
 * nothing is undefined, and the alternative invents a trend on a platform's
 * first week that people then quote.
 *
 * ── Why the buckets are filled in ───────────────────────────────────────────
 *
 * Postgres `GROUP BY date` returns only days that HAVE rows. Handing that
 * straight to a line chart draws a continuous line across the gaps, which reads
 * as steady activity on days when nothing happened. Every series here is
 * densified against the full range so an empty day is drawn as the zero it is.
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The dashboard, in one round trip (ADM-01). */
  async dashboard(windowDays: number): Promise<AdminDashboardView> {
    const started = Date.now();
    const range = windowRange(windowDays);

    const [kpis, series, jobsByCategory, escrow, disputes, sos, health] = await Promise.all([
      this.kpis(range),
      this.dashboardSeries(range),
      this.jobsByCategory(range),
      this.escrowOverview(range),
      this.disputeOverview(range),
      this.sosOverview(range),
      this.systemHealth(range),
    ]);

    this.warnIfSlow('dashboard', started, { windowDays });

    return { windowDays, kpis, series, jobsByCategory, escrow, disputes, sos, health };
  }

  /** Analytics & Reports (ADM-07). */
  async analytics(windowDays: number): Promise<AdminAnalyticsView> {
    const started = Date.now();
    const range = windowRange(windowDays);

    const [
      series,
      jobsByCategory,
      jobsByLocation,
      revenueBySource,
      trustScoreDistribution,
      topPerformers,
    ] = await Promise.all([
      this.analyticsSeries(range),
      this.jobsByCategory(range),
      this.jobsByLocation(range),
      this.revenueBySource(range),
      this.trustScoreDistribution(),
      this.topPerformers(range),
    ]);

    this.warnIfSlow('analytics', started, { windowDays });

    return {
      windowDays,
      series,
      jobsByCategory,
      jobsByLocation,
      revenueBySource,
      trustScoreDistribution,
      topPerformers,
    };
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────

  private async kpis(range: WindowRange): Promise<KpiView[]> {
    const [
      totalUsers,
      totalUsersBefore,
      verifiedWorkers,
      verifiedWorkersBefore,
      completedJobs,
      completedJobsPrevious,
      revenue,
      revenuePrevious,
    ] = await Promise.all([
      // Cumulative totals compare "everything up to now" with "everything up to
      // the start of this window" — the growth an operator means by "total users
      // is up 8%", not the count of rows inside the window.
      this.prisma.client.user.count({ where: { status: { not: UserStatus.DELETED } } }),
      this.prisma.client.user.count({
        where: { status: { not: UserStatus.DELETED }, createdAt: { lt: range.start } },
      }),

      this.prisma.client.user.count({
        where: {
          status: { not: UserStatus.DELETED },
          tier: { in: [VerificationTier.TIER_2, VerificationTier.TIER_3] },
          roles: { some: { role: Role.WORKER } },
        },
      }),
      this.prisma.client.user.count({
        where: {
          status: { not: UserStatus.DELETED },
          tier: { in: [VerificationTier.TIER_2, VerificationTier.TIER_3] },
          roles: { some: { role: Role.WORKER } },
          createdAt: { lt: range.start },
        },
      }),

      // Flow metrics compare window against window.
      this.prisma.client.job.count({
        where: {
          status: { in: [JobStatus.COMPLETED, JobStatus.RELEASED] },
          statusUpdatedAt: { gte: range.start, lt: range.end },
        },
      }),
      this.prisma.client.job.count({
        where: {
          status: { in: [JobStatus.COMPLETED, JobStatus.RELEASED] },
          statusUpdatedAt: { gte: range.previousStart, lt: range.start },
        },
      }),

      this.sumFees(range.start, range.end),
      this.sumFees(range.previousStart, range.start),
    ]);

    return [
      kpi('TOTAL_USERS', totalUsers, totalUsersBefore),
      kpi('VERIFIED_WORKERS', verifiedWorkers, verifiedWorkersBefore),
      kpi('JOBS_COMPLETED', completedJobs, completedJobsPrevious),
      kpi('REVENUE', revenue, revenuePrevious),
    ];
  }

  /**
   * Platform revenue = the FEE rows, and only the SUCCESS ones.
   *
   * Not gross payment volume: money passing through escrow on its way to a
   * worker was never the platform's, and counting it as revenue is the single
   * most common way a marketplace dashboard flatters itself.
   */
  private async sumFees(from: Date, to: Date): Promise<number> {
    const result = await this.prisma.client.transaction.aggregate({
      where: {
        type: TransactionType.FEE,
        status: TransactionStatus.SUCCESS,
        createdAt: { gte: from, lt: to },
      },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  // ── Time series ───────────────────────────────────────────────────────────

  private async dashboardSeries(range: WindowRange): Promise<TimeSeriesView[]> {
    const [users, jobs, revenue] = await Promise.all([
      this.dailyCount('User', 'createdAt', range),
      this.dailyCount('Job', 'publishedAt', range),
      this.dailyRevenue(range),
    ]);

    return [
      { key: 'USER_GROWTH', points: densify(users, range) },
      { key: 'JOBS_POSTED', points: densify(jobs, range) },
      { key: 'REVENUE', points: densify(revenue, range) },
    ];
  }

  private async analyticsSeries(range: WindowRange): Promise<TimeSeriesView[]> {
    const [users, posted, completed, revenue] = await Promise.all([
      this.dailyCount('User', 'createdAt', range),
      this.dailyCount('Job', 'publishedAt', range),
      this.dailyCompletedJobs(range),
      this.dailyRevenue(range),
    ]);

    return [
      { key: 'USER_GROWTH', points: densify(users, range) },
      { key: 'JOBS_POSTED', points: densify(posted, range) },
      { key: 'JOBS_COMPLETED', points: densify(completed, range) },
      { key: 'REVENUE', points: densify(revenue, range) },
    ];
  }

  /**
   * A day-bucketed count.
   *
   * Raw SQL rather than Prisma groupBy: bucketing a timestamp to a UTC day is a
   * `date_trunc`, and Prisma has no expression for it — the alternative is
   * pulling every row into Node to group in memory, which is the N+1 the
   * standards forbid wearing a different hat.
   *
   * The table and column names are NOT user input. They are literals chosen at
   * each call site below, which is what makes the interpolation safe; anything
   * reaching this from a request would be an injection, so the type keeps the
   * choice closed.
   */
  private async dailyCount(
    table: 'User' | 'Job',
    column: 'createdAt' | 'publishedAt',
    range: WindowRange,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.client.$queryRaw<{ bucket: Date; value: bigint }[]>(
      Prisma.sql`
        SELECT date_trunc('day', ${Prisma.raw(`"${column}"`)}) AS bucket, COUNT(*)::bigint AS value
        FROM ${Prisma.raw(`"${table}"`)}
        WHERE ${Prisma.raw(`"${column}"`)} >= ${range.start}
          AND ${Prisma.raw(`"${column}"`)} < ${range.end}
        GROUP BY 1
        ORDER BY 1
      `,
    );

    return new Map(rows.map((row) => [dayKey(row.bucket), Number(row.value)]));
  }

  private async dailyCompletedJobs(range: WindowRange): Promise<Map<string, number>> {
    const rows = await this.prisma.client.$queryRaw<{ bucket: Date; value: bigint }[]>(
      Prisma.sql`
        SELECT date_trunc('day', "statusUpdatedAt") AS bucket, COUNT(*)::bigint AS value
        FROM "Job"
        WHERE "status" IN ('COMPLETED', 'RELEASED')
          AND "statusUpdatedAt" >= ${range.start}
          AND "statusUpdatedAt" < ${range.end}
        GROUP BY 1
        ORDER BY 1
      `,
    );

    return new Map(rows.map((row) => [dayKey(row.bucket), Number(row.value)]));
  }

  private async dailyRevenue(range: WindowRange): Promise<Map<string, number>> {
    const rows = await this.prisma.client.$queryRaw<{ bucket: Date; value: bigint }[]>(
      Prisma.sql`
        SELECT date_trunc('day', "createdAt") AS bucket, COALESCE(SUM("amount"), 0)::bigint AS value
        FROM "Transaction"
        WHERE "type" = 'FEE'
          AND "status" = 'SUCCESS'
          AND "createdAt" >= ${range.start}
          AND "createdAt" < ${range.end}
        GROUP BY 1
        ORDER BY 1
      `,
    );

    return new Map(rows.map((row) => [dayKey(row.bucket), Number(row.value)]));
  }

  // ── Breakdowns ────────────────────────────────────────────────────────────

  private async jobsByCategory(range: WindowRange): Promise<BreakdownSliceView[]> {
    const groups = await this.prisma.client.job.groupBy({
      by: ['categoryId'],
      where: {
        status: { not: JobStatus.DRAFT },
        createdAt: { gte: range.start, lt: range.end },
      },
      _count: { _all: true },
    });

    const categoryIds = groups
      .map((group) => group.categoryId)
      .filter((id): id is string => id !== null);

    // One lookup for every label, not one per slice.
    const categories = await this.prisma.client.serviceCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, nameEn: true },
    });
    const labels = new Map(categories.map((category) => [category.id, category.nameEn]));

    return toSlices(
      groups.map((group) => ({
        id: group.categoryId,
        // A published job always has a category; only autosaved drafts do not,
        // and those are excluded above. The fallback covers legacy rows rather
        // than pretending they are a category called "Other".
        label: group.categoryId ? (labels.get(group.categoryId) ?? 'UNKNOWN') : 'UNCATEGORISED',
        value: group._count._all,
      })),
    );
  }

  private async jobsByLocation(range: WindowRange): Promise<BreakdownSliceView[]> {
    const groups = await this.prisma.client.job.groupBy({
      by: ['city'],
      where: {
        status: { not: JobStatus.DRAFT },
        createdAt: { gte: range.start, lt: range.end },
        city: { not: null },
      },
      _count: { _all: true },
    });

    return toSlices(
      groups.map((group) => ({
        id: null,
        label: group.city ?? 'UNKNOWN',
        value: group._count._all,
      })),
    );
  }

  /**
   * Revenue by the rail the money arrived on (ADM-07).
   *
   * The fee row itself is an internal move with no payment method, so the source
   * is taken from the DEPOSIT/PAYMENT that funded the same escrow hold. Joining
   * through the hold is what makes "which operator did this revenue come in
   * over" answerable at all.
   */
  private async revenueBySource(range: WindowRange): Promise<BreakdownSliceView[]> {
    const rows = await this.prisma.client.$queryRaw<{ label: string | null; value: bigint }[]>(
      Prisma.sql`
        SELECT funding."type"::text AS label, COALESCE(SUM(fee."amount"), 0)::bigint AS value
        FROM "Transaction" fee
        LEFT JOIN LATERAL (
          SELECT pm."type"
          FROM "Transaction" collection
          JOIN "PaymentMethod" pm ON pm."id" = collection."paymentMethodId"
          WHERE collection."escrowHoldId" = fee."escrowHoldId"
            AND collection."type" IN ('PAYMENT', 'DEPOSIT')
            AND collection."status" = 'SUCCESS'
          ORDER BY collection."createdAt" ASC
          LIMIT 1
        ) funding ON TRUE
        WHERE fee."type" = 'FEE'
          AND fee."status" = 'SUCCESS'
          AND fee."createdAt" >= ${range.start}
          AND fee."createdAt" < ${range.end}
        GROUP BY 1
        ORDER BY 2 DESC
      `,
    );

    return toSlices(
      rows.map((row) => ({
        id: null,
        // A null rail means the fee's funding row carried no payment method —
        // reported as its own bucket rather than silently folded into a real
        // operator's revenue.
        label: row.label ?? 'UNATTRIBUTED',
        value: Number(row.value),
      })),
    );
  }

  /**
   * Trust Score distribution in bands of ten (ADM-07).
   *
   * Every band is emitted, including the empty ones: a histogram that drops its
   * zero bars silently changes its own shape, and the shape is the entire point
   * of looking at a distribution.
   */
  private async trustScoreDistribution(): Promise<BreakdownSliceView[]> {
    const rows = await this.prisma.client.$queryRaw<{ band: number; value: bigint }[]>(
      Prisma.sql`
        SELECT LEAST(FLOOR("total" / 10) * 10, 90)::int AS band, COUNT(*)::bigint AS value
        FROM "TrustScore"
        WHERE "suspended" = FALSE
        GROUP BY 1
      `,
    );

    const counts = new Map(rows.map((row) => [row.band, Number(row.value)]));
    const bands = Array.from({ length: 10 }, (_, index) => index * 10);

    return toSlices(
      bands.map((band) => ({
        id: null,
        label: `${band}-${band + 9}`,
        value: counts.get(band) ?? 0,
      })),
      // Empty bands must survive the slice mapping.
      { keepZero: true },
    );
  }

  /**
   * Top performers (ADM-07): the workers who actually delivered in the window.
   *
   * Ranked on completed work and earnings rather than on Trust Score, because
   * the Trust Score is already visible everywhere else and a leaderboard of it
   * would just restate the ranking the whole product runs on. What an operator
   * cannot see elsewhere is who is carrying the marketplace this month.
   */
  private async topPerformers(range: WindowRange): Promise<TopPerformerView[]> {
    const rows = await this.prisma.client.$queryRaw<
      {
        userId: string;
        name: string | null;
        avatar: string | null;
        completedJobs: bigint;
        earned: bigint;
        trustScore: number | null;
        averageRating: Prisma.Decimal | null;
      }[]
    >(
      Prisma.sql`
        SELECT
          u."id"            AS "userId",
          u."name"          AS "name",
          u."avatar"        AS "avatar",
          COUNT(e."id")::bigint                     AS "completedJobs",
          COALESCE(SUM(e."payoutAmount"), 0)::bigint AS "earned",
          ts."total"        AS "trustScore",
          ts."averageRating" AS "averageRating"
        FROM "EscrowHold" e
        JOIN "User" u ON u."id" = e."workerId"
        LEFT JOIN "TrustScore" ts ON ts."subjectId" = u."id"
        WHERE e."state" = 'RELEASED'
          AND e."releasedAt" >= ${range.start}
          AND e."releasedAt" < ${range.end}
          AND u."status" <> 'DELETED'
        GROUP BY u."id", u."name", u."avatar", ts."total", ts."averageRating"
        ORDER BY "earned" DESC, "completedJobs" DESC
        LIMIT ${TOP_PERFORMER_LIMIT}
      `,
    );

    return rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      avatar: row.avatar,
      completedJobs: Number(row.completedJobs),
      earned: Number(row.earned),
      trustScore: row.trustScore ?? 0,
      // NULL until they have been rated. Not zero — an unrated worker on a
      // leaderboard shown as 0.0 is being libelled by a rounding decision.
      averageRating: row.averageRating === null ? null : Number(row.averageRating),
    }));
  }

  // ── Overviews ─────────────────────────────────────────────────────────────

  private async escrowOverview(range: WindowRange): Promise<EscrowOverviewView> {
    const [live, released, refunded, disputed] = await Promise.all([
      this.prisma.client.escrowHold.aggregate({
        where: {
          state: {
            in: [
              EscrowState.PAID,
              EscrowState.ACCEPTED,
              EscrowState.IN_PROGRESS,
              EscrowState.COMPLETED,
            ],
          },
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.client.escrowHold.aggregate({
        where: { state: EscrowState.RELEASED, releasedAt: { gte: range.start, lt: range.end } },
        _sum: { payoutAmount: true },
      }),
      this.prisma.client.escrowHold.aggregate({
        where: { state: EscrowState.REFUNDED, refundedAt: { gte: range.start, lt: range.end } },
        _sum: { amount: true },
      }),
      this.prisma.client.escrowHold.count({ where: { state: EscrowState.DISPUTED } }),
    ]);

    return {
      activeHolds: live._count._all,
      heldAmount: live._sum.amount ?? 0,
      releasedAmount: released._sum.payoutAmount ?? 0,
      refundedAmount: refunded._sum.amount ?? 0,
      disputedHolds: disputed,
    };
  }

  private async disputeOverview(range: WindowRange): Promise<DisputeOverviewView> {
    const [open, escalated, resolved, frozen, resolutionTimes] = await Promise.all([
      this.prisma.client.dispute.count({ where: { status: DisputeStatus.OPEN } }),
      this.prisma.client.dispute.count({ where: { status: DisputeStatus.ESCALATED } }),
      this.prisma.client.dispute.count({
        where: { status: DisputeStatus.RESOLVED, resolvedAt: { gte: range.start, lt: range.end } },
      }),
      this.prisma.client.escrowHold.aggregate({
        where: { state: EscrowState.DISPUTED },
        _sum: { amount: true },
      }),
      this.prisma.client.$queryRaw<{ hours: number | null }[]>(
        Prisma.sql`
          SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600) AS hours
          FROM "Dispute"
          WHERE "status" = 'RESOLVED'
            AND "resolvedAt" >= ${range.start}
            AND "resolvedAt" < ${range.end}
        `,
      ),
    ]);

    const hours = resolutionTimes[0]?.hours;

    return {
      open,
      underReview: escalated,
      resolvedInWindow: resolved,
      frozenAmount: frozen._sum.amount ?? 0,
      // NULL when nothing was resolved in the window. AVG over an empty set is
      // already NULL in SQL; the point is not to coerce it to 0 on the way out.
      averageResolutionHours: hours === null || hours === undefined ? null : Number(hours),
    };
  }

  private async sosOverview(range: WindowRange): Promise<SosOverviewView> {
    const [active, raised, resolved, latest] = await Promise.all([
      this.prisma.client.sOSAlert.count({ where: { status: SOSStatus.ACTIVE } }),
      this.prisma.client.sOSAlert.count({
        where: { createdAt: { gte: range.start, lt: range.end } },
      }),
      this.prisma.client.sOSAlert.count({
        where: {
          status: { in: [SOSStatus.RESOLVED, SOSStatus.FALSE_ALARM] },
          updatedAt: { gte: range.start, lt: range.end },
        },
      }),
      this.prisma.client.sOSAlert.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      active,
      raisedInWindow: raised,
      resolvedInWindow: resolved,
      lastRaisedAt: latest?.createdAt ?? null,
    };
  }

  /**
   * System health (ADM-01).
   *
   * Deliberately thin. This reports what the API can observe about ITSELF and
   * its own dependencies — the database answered, deliveries are failing, money
   * rows are stuck unreconciled. It does NOT report uptime or p99 latency: those
   * belong to the infrastructure monitor, and a service that grades its own
   * availability is grading it from inside the sample.
   */
  private async systemHealth(range: WindowRange): Promise<SystemHealthView> {
    const probeStarted = Date.now();
    let databaseUp = true;
    let databaseLatencyMs: number | null = null;

    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      databaseLatencyMs = Date.now() - probeStarted;
    } catch (error) {
      databaseUp = false;
      logger.error('Admin health probe could not reach the database', { error });
    }

    if (!databaseUp) {
      // Every figure below comes FROM the database. Reporting zeros for them
      // while the database is unreachable would say "nothing is failing" at the
      // exact moment everything is.
      return {
        status: 'DOWN',
        databaseUp: false,
        databaseLatencyMs: null,
        failedNotifications: 0,
        stalePendingTransactions: 0,
      };
    }

    const staleBefore = new Date(Date.now() - STALE_PENDING_MINUTES * 60_000);

    const [failedNotifications, stalePendingTransactions] = await Promise.all([
      this.prisma.client.notificationLog.count({
        where: {
          status: NotificationStatus.FAILED,
          createdAt: { gte: range.start, lt: range.end },
        },
      }),
      this.prisma.client.transaction.count({
        where: {
          status: TransactionStatus.PENDING,
          campayReference: { not: null },
          createdAt: { lt: staleBefore },
        },
      }),
    ]);

    return {
      status: stalePendingTransactions > 0 || failedNotifications > 0 ? 'DEGRADED' : 'OK',
      databaseUp,
      databaseLatencyMs,
      failedNotifications,
      stalePendingTransactions,
    };
  }

  private warnIfSlow(scope: string, started: number, result: Record<string, unknown>): void {
    const durationMs = Date.now() - started;
    if (durationMs > 300) {
      logger.warn(`Admin ${scope} exceeded the slow-query budget`, { result, durationMs });
    }
  }
}
