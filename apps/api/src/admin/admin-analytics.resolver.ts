import { BadRequestException } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { RequirePermissions } from '../auth/decorators/auth.decorators';
import { AdminAnalyticsService } from './admin-analytics.service';
import { ALLOWED_WINDOW_DAYS, isAllowedWindow } from './admin-metrics.model';
import { AdminAnalyticsView, AdminDashboardView } from './models/admin-analytics.model';

const DEFAULT_WINDOW_DAYS = 30;

/**
 * Admin dashboard, analytics and reports (ADM-01, ADM-07). GraphQL reads per the
 * DUAL API RULE.
 *
 * Gated on `admin:access` rather than on the ADMIN role name, so granting a
 * future read-only Ops role the dashboard is a change in the permission table
 * alone (NFR-SEC-02). Nothing here is `@Public()` — these are platform-wide
 * aggregates over every user's money and behaviour.
 *
 * ── On export ───────────────────────────────────────────────────────────────
 * There is no `exportReport` mutation and no REST download endpoint, and that is
 * deliberate. Export (ADM-07) is a rendering of a read the admin has already
 * performed, so the web console builds the CSV from the analytics query it
 * already holds. A server-side exporter would be a SECOND implementation of
 * every aggregate above, free to drift from the numbers on the screen — and an
 * export that disagrees with the dashboard it came from is worse than no export.
 */
@Resolver()
export class AdminAnalyticsResolver {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @RequirePermissions('admin:access')
  @Query(() => AdminDashboardView, {
    description:
      'Platform KPIs with deltas, performance charts, jobs by category, escrow and dispute overviews, SOS and system health (ADM-01).',
  })
  async adminDashboard(
    @Args('windowDays', { type: () => Int, nullable: true }) windowDays?: number,
  ): Promise<AdminDashboardView> {
    return this.analytics.dashboard(resolveWindow(windowDays));
  }

  @RequirePermissions('admin:access')
  @Query(() => AdminAnalyticsView, {
    description:
      'Analytics & Reports: user growth, jobs over time, jobs by category and location, revenue by source, trust-score distribution and top performers (ADM-07).',
  })
  async adminAnalytics(
    @Args('windowDays', { type: () => Int, nullable: true }) windowDays?: number,
  ): Promise<AdminAnalyticsView> {
    return this.analytics.analytics(resolveWindow(windowDays));
  }
}

/**
 * A closed list of windows, not an arbitrary integer.
 *
 * `windowDays: 100000` would ask Postgres to bucket and densify a quarter of a
 * million days per series — an authenticated denial of service dressed as a
 * filter. Operators reason in weeks, months, quarters and years anyway.
 */
function resolveWindow(windowDays?: number | null): number {
  if (windowDays === undefined || windowDays === null) return DEFAULT_WINDOW_DAYS;

  if (!isAllowedWindow(windowDays)) {
    throw new BadRequestException(`windowDays must be one of ${ALLOWED_WINDOW_DAYS.join(', ')}.`);
  }

  return windowDays;
}
