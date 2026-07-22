import { BadRequestException } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { RequirePermissions } from '../auth/decorators/auth.decorators';
import { ALLOWED_WINDOW_DAYS, isAllowedWindow } from './admin-metrics.model';
import { AdminRiskService } from './admin-risk.service';
import { ActivityCellView, AdminRiskView } from './models/admin-risk.model';

const DEFAULT_WINDOW_DAYS = 30;

/**
 * The Fraud & Risk monitor (ADM-06). GraphQL reads per the DUAL API RULE.
 *
 * Gated on `admin:moderate`, not merely `admin:access`: this surface names
 * individuals and lists the evidence against them, which is a narrower thing
 * than reading platform totals. Someone who may look at the revenue chart has
 * not thereby been cleared to read a dossier on a named user.
 *
 * Acting on what the monitor shows happens through the existing moderation
 * writes (ADM-08) — one append-only trail with a reason and a notification to
 * the party, rather than a second, quieter way to suspend somebody.
 */
@Resolver()
export class AdminRiskResolver {
  constructor(private readonly risk: AdminRiskService) {}

  @RequirePermissions('admin:moderate')
  @Query(() => AdminRiskView, {
    description:
      'High-risk accounts, suspicious jobs, blocked accounts and open-report volume (ADM-06). Every level is derived live; none is stored.',
  })
  async adminRiskMonitor(
    @Args('windowDays', { type: () => Int, nullable: true }) windowDays?: number,
  ): Promise<AdminRiskView> {
    return this.risk.monitor(resolveWindow(windowDays));
  }

  @RequirePermissions('admin:moderate')
  @Query(() => [ActivityCellView], {
    description:
      'Aggregated job-activity cells for the platform heatmap (ADM-06). Cells below the aggregation floor are omitted, so no cell can identify one job.',
  })
  async adminActivityHeatmap(
    @Args('windowDays', { type: () => Int, nullable: true }) windowDays?: number,
  ): Promise<ActivityCellView[]> {
    return this.risk.activityHeatmap(resolveWindow(windowDays));
  }
}

function resolveWindow(windowDays?: number | null): number {
  if (windowDays === undefined || windowDays === null) return DEFAULT_WINDOW_DAYS;

  if (!isAllowedWindow(windowDays)) {
    throw new BadRequestException(`windowDays must be one of ${ALLOWED_WINDOW_DAYS.join(', ')}.`);
  }

  return windowDays;
}
