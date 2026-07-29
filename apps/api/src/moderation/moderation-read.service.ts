import { Injectable } from '@nestjs/common';
import { AbuseReportReason, AbuseReportStatus, Prisma, ReportTargetType } from '@kavio/database';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationTargetService } from './moderation-target.service';
import type {
  ModerationActionView,
  ModerationPartyView,
  ModerationQueueSummaryView,
  ReportGroupDetailView,
  ReportGroupView,
} from './models/moderation.model';

/**
 * Reporting & moderation READS (GraphQL, per the DUAL API RULE; ADM-08).
 *
 * The queue is grouped by (targetType, targetId) in SQL rather than in the
 * resolver: an admin's unit of work is the ITEM, so the database returns items
 * and their counts, and only the page being shown is hydrated with previews and
 * party details. Grouping in application code would mean pulling every report row
 * to collapse them — which is exactly the query that stops working at the volume
 * a moderation queue eventually reaches.
 */
@Injectable()
export class ModerationReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: ModerationTargetService,
  ) {}

  /** Headline counts for the workspace (ADM-08). */
  async summary(): Promise<ModerationQueueSummaryView> {
    const [openGroupRows, reviewingGroupRows, openReports] = await Promise.all([
      this.prisma.client.abuseReport.groupBy({
        by: ['targetType', 'targetId'],
        where: { status: AbuseReportStatus.OPEN },
      }),
      this.prisma.client.abuseReport.groupBy({
        by: ['targetType', 'targetId'],
        where: { status: AbuseReportStatus.REVIEWING },
      }),
      this.prisma.client.abuseReport.count({
        where: { status: { in: [AbuseReportStatus.OPEN, AbuseReportStatus.REVIEWING] } },
      }),
    ]);

    return {
      openGroups: openGroupRows.length,
      reviewingGroups: reviewingGroupRows.length,
      openReports,
    };
  }

  /**
   * The grouped queue (ADM-08). `status` filters which reports count toward a
   * group; groups with nothing matching drop out entirely.
   */
  async queue(
    statuses: AbuseReportStatus[],
    targetType: ReportTargetType | null,
    limit: number,
    offset: number,
  ): Promise<ReportGroupView[]> {
    const take = Math.min(Math.max(limit, 1), 50);

    const where: Prisma.AbuseReportWhereInput = {
      status: { in: statuses },
      ...(targetType ? { targetType } : {}),
    };

    const groups = await this.prisma.client.abuseReport.groupBy({
      by: ['targetType', 'targetId'],
      where,
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
      // Most-reported first, then most recent: volume is the strongest signal
      // that something needs a human now.
      orderBy: [{ _count: { id: 'desc' } }, { _max: { createdAt: 'desc' } }],
      take,
      skip: Math.max(offset, 0),
    });

    return Promise.all(groups.map((group) => this.hydrateGroup(group.targetType, group.targetId)));
  }

  /** One case opened up: item, party, every complaint, and the party's history. */
  async group(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<ReportGroupDetailView | null> {
    const reports = await this.prisma.client.abuseReport.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        reason: true,
        details: true,
        status: true,
        createdAt: true,
        reporter: { select: { id: true, name: true, avatar: true, status: true } },
      },
    });

    if (reports.length === 0) {
      return null;
    }

    const group = await this.hydrateGroup(targetType, targetId);

    const history = group.reportedUser ? await this.partyHistory(group.reportedUser.id) : [];

    return {
      group,
      reports: reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        details: report.details,
        status: report.status,
        createdAt: report.createdAt,
        reporter: report.reporter
          ? {
              id: report.reporter.id,
              name: report.reporter.name,
              avatar: report.reporter.avatar,
              status: report.reporter.status,
              // Not counted for reporters: the number that matters here is the
              // reported party's, and a count per reporter row would be N+1.
              priorActionCount: 0,
            }
          : null,
      })),
      history,
      removable: this.targets.supportsRemoval(targetType),
    };
  }

  /** A party's moderation record — pattern beats incident (ADM-08). */
  async partyHistory(userId: string): Promise<ModerationActionView[]> {
    const rows = await this.prisma.client.moderationAction.findMany({
      where: { subjectUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        action: true,
        reason: true,
        targetType: true,
        targetId: true,
        expiresAt: true,
        createdAt: true,
        actor: { select: { id: true, name: true, avatar: true, status: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      reason: row.reason,
      targetType: row.targetType,
      targetId: row.targetId,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      actor: row.actor
        ? {
            id: row.actor.id,
            name: row.actor.name,
            avatar: row.actor.avatar,
            status: row.actor.status,
            priorActionCount: 0,
          }
        : null,
    }));
  }

  /**
   * Turns a (type, id) pair into a queue row: the item's preview, the accountable
   * party with their prior record, and the group's counts.
   */
  private async hydrateGroup(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<ReportGroupView> {
    const [target, rows] = await Promise.all([
      this.targets.resolve(targetType, targetId),
      this.prisma.client.abuseReport.findMany({
        where: { targetType, targetId },
        select: { reason: true, status: true, createdAt: true, reportedUserId: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const openCount = rows.filter(
      (row) => row.status === AbuseReportStatus.OPEN || row.status === AbuseReportStatus.REVIEWING,
    ).length;

    // Reasons ranked by how often they were cited: the headline of a case is what
    // most reporters independently said about it.
    const tally = new Map<AbuseReportReason, number>();
    for (const row of rows) {
      tally.set(row.reason, (tally.get(row.reason) ?? 0) + 1);
    }
    const reasons = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([reason]) => reason);

    const timestamps = rows.map((row) => row.createdAt.getTime());

    const partyId = target.ownerId ?? rows[0]?.reportedUserId ?? null;

    return {
      target: {
        targetType,
        targetId,
        exists: target.exists,
        label: target.label,
        excerpt: target.excerpt,
        imageUrl: target.imageUrl,
        url: target.url,
      },
      reportedUser: partyId ? await this.party(partyId) : null,
      openCount,
      totalCount: rows.length,
      status: mostAdvancedStatus(rows.map((row) => row.status)),
      reasons,
      firstReportedAt: new Date(Math.min(...timestamps)),
      lastReportedAt: new Date(Math.max(...timestamps)),
    };
  }

  private async party(userId: string): Promise<ModerationPartyView | null> {
    const [user, priorActionCount] = await Promise.all([
      this.prisma.client.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, avatar: true, status: true },
      }),
      this.prisma.client.moderationAction.count({ where: { subjectUserId: userId } }),
    ]);

    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      status: user.status,
      priorActionCount,
    };
  }
}

/**
 * The status a mixed group shows. An open complaint outranks a decided one: a
 * case with one untouched report still needs a human, whatever happened to the
 * others.
 */
function mostAdvancedStatus(statuses: AbuseReportStatus[]): AbuseReportStatus {
  if (statuses.includes(AbuseReportStatus.OPEN)) return AbuseReportStatus.OPEN;
  if (statuses.includes(AbuseReportStatus.REVIEWING)) return AbuseReportStatus.REVIEWING;
  if (statuses.includes(AbuseReportStatus.ACTIONED)) return AbuseReportStatus.ACTIONED;
  return AbuseReportStatus.DISMISSED;
}
