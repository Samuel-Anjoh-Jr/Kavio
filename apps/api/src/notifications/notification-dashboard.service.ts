import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Prisma } from '@trustpro/database';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DailyDeliveryStatView,
  DeliveryDashboardView,
  DeliveryStatView,
} from './models/notification-dashboard.model';

interface Counts {
  sent: number;
  failed: number;
  pending: number;
}

/**
 * The admin notification-delivery dashboard (SRS §26.1, P76). Everything is
 * derived from NotificationLog — one grouped query per axis rather than a scan —
 * so the dashboard stays cheap even as the log grows, and it never reads rendered
 * content (the log stores only templateKey).
 */
@Injectable()
export class NotificationDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(from: Date, to: Date): Promise<DeliveryDashboardView> {
    const createdAt: Prisma.DateTimeFilter = { gte: from, lte: to };

    const [byChannelRows, byTemplateRows, byDay] = await Promise.all([
      this.prisma.client.notificationLog.groupBy({
        by: ['channel', 'status'],
        where: { createdAt },
        _count: { _all: true },
      }),
      this.prisma.client.notificationLog.groupBy({
        by: ['templateKey', 'status'],
        where: { createdAt },
        _count: { _all: true },
      }),
      this.byDay(from, to),
    ]);

    // Fold the (key, status) rows into a counts map per key.
    const byChannel = foldStats(
      byChannelRows.map((r) => ({ key: r.channel, status: r.status, count: r._count._all })),
      Object.values(NotificationChannel),
    );
    const byTemplate = foldStats(
      byTemplateRows.map((r) => ({ key: r.templateKey, status: r.status, count: r._count._all })),
    ).sort((a, b) => b.total - a.total);

    const totals = sumStat(
      'ALL',
      byChannel.reduce<Counts>(
        (acc, s) => ({
          sent: acc.sent + s.sent,
          failed: acc.failed + s.failed,
          pending: acc.pending + s.pending,
        }),
        { sent: 0, failed: 0, pending: 0 },
      ),
    );

    return { from, to, totals, byChannel, byTemplate, byDay };
  }

  /** Per-day counts via date_trunc; Prisma groupBy cannot truncate a timestamp. */
  private async byDay(from: Date, to: Date): Promise<DailyDeliveryStatView[]> {
    const rows = await this.prisma.client.$queryRaw<
      Array<{ day: Date; status: NotificationStatus; count: bigint }>
    >(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS day, "status", COUNT(*)::bigint AS count
      FROM "NotificationLog"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY day, "status"
      ORDER BY day ASC
    `);

    const byDate = new Map<string, Counts>();
    for (const row of rows) {
      const date = row.day.toISOString().slice(0, 10);
      const counts = byDate.get(date) ?? { sent: 0, failed: 0, pending: 0 };
      applyStatus(counts, row.status, Number(row.count));
      byDate.set(date, counts);
    }

    return [...byDate.entries()].map(([date, c]) => ({
      date,
      sent: c.sent,
      failed: c.failed,
      pending: c.pending,
    }));
  }
}

/** Rolls (key, status, count) rows up to one DeliveryStatView per key. */
function foldStats(
  rows: Array<{ key: string; status: NotificationStatus; count: number }>,
  seedKeys: string[] = [],
): DeliveryStatView[] {
  const map = new Map<string, Counts>();
  for (const key of seedKeys) {
    map.set(key, { sent: 0, failed: 0, pending: 0 });
  }
  for (const row of rows) {
    const counts = map.get(row.key) ?? { sent: 0, failed: 0, pending: 0 };
    applyStatus(counts, row.status, row.count);
    map.set(row.key, counts);
  }
  return [...map.entries()].map(([key, counts]) => sumStat(key, counts));
}

function applyStatus(counts: Counts, status: NotificationStatus, n: number): void {
  if (status === NotificationStatus.SENT) counts.sent += n;
  else if (status === NotificationStatus.FAILED) counts.failed += n;
  else counts.pending += n;
}

function sumStat(key: string, counts: Counts): DeliveryStatView {
  const total = counts.sent + counts.failed + counts.pending;
  return {
    key,
    sent: counts.sent,
    failed: counts.failed,
    pending: counts.pending,
    total,
    successRate: total > 0 ? counts.sent / total : 0,
  };
}
