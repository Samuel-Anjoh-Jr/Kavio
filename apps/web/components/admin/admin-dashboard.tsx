'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Activity, AlertTriangle, HeartPulse, Scale } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDateTime } from '@/lib/datetime';
import { formatXaf } from '@/lib/discovery';
import type { AdminWindow } from '@/lib/admin';
import {
  ADMIN_DASHBOARD_QUERY,
  type AdminDashboardQueryResult,
  type TimeSeries,
} from '@/lib/graphql/admin';
import { BarBreakdown, KpiTile, TimeSeriesChart } from './charts';
import { WindowPicker } from './window-picker';

/**
 * The admin dashboard (ADM-01): KPIs with deltas, performance charts, jobs by
 * category, escrow and dispute overviews, SOS alerts and system health.
 *
 * Dense and calm, per TMDS: this is a screen an operator keeps open all day, so
 * nothing here animates on load and nothing pulses for attention except the two
 * things that genuinely warrant it — a live SOS alert and a degraded system.
 *
 * RBAC is the API's `admin:access` guard on every query. The page's role check is
 * a routing courtesy.
 */
export function AdminDashboard() {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const [windowDays, setWindowDays] = useState<AdminWindow>(30);

  const { data, loading, error } = useQuery<AdminDashboardQueryResult>(ADMIN_DASHBOARD_QUERY, {
    variables: { windowDays },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });

  const dashboard = data?.adminDashboard;

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-52 w-full rounded-card" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
        {error ? t('loadError') : t('noData')}
      </p>
    );
  }

  const money = (value: number) => formatXaf(value, locale) ?? '—';
  const series = (key: string): TimeSeries | undefined =>
    dashboard.series.find((entry) => entry.key === key);

  return (
    <div className="flex flex-col gap-8">
      <WindowPicker value={windowDays} onChange={setWindowDays} />

      <section aria-labelledby="kpis-heading">
        <h2 id="kpis-heading" className="sr-only">
          {t('kpisHeading')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {dashboard.kpis.map((kpi) => (
            <KpiTile
              key={kpi.key}
              label={t(`kpi.${kpi.key}`)}
              value={kpi.key === 'REVENUE' ? money(kpi.value) : kpi.value.toLocaleString()}
              delta={kpi.delta}
              noComparisonLabel={t('noComparison')}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="charts-heading" className="grid gap-6 lg:grid-cols-2">
        <h2 id="charts-heading" className="sr-only">
          {t('chartsHeading')}
        </h2>

        <Panel title={t('series.USER_GROWTH')}>
          <TimeSeriesChart
            points={series('USER_GROWTH')?.points ?? []}
            label={t('series.USER_GROWTH')}
          />
        </Panel>

        <Panel title={t('series.JOBS_POSTED')}>
          <TimeSeriesChart
            points={series('JOBS_POSTED')?.points ?? []}
            label={t('series.JOBS_POSTED')}
          />
        </Panel>

        <Panel title={t('series.REVENUE')}>
          <TimeSeriesChart
            points={series('REVENUE')?.points ?? []}
            label={t('series.REVENUE')}
            format={money}
          />
        </Panel>

        <Panel title={t('jobsByCategory')}>
          <BarBreakdown slices={dashboard.jobsByCategory} emptyLabel={t('noCategoryData')} />
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title={t('escrowHeading')} icon={<Scale aria-hidden className="size-4" />}>
          <dl className="flex flex-col gap-2 text-sm">
            <Row label={t('escrow.held')} value={money(dashboard.escrow.heldAmount)} />
            <Row label={t('escrow.activeHolds')} value={String(dashboard.escrow.activeHolds)} />
            <Row label={t('escrow.released')} value={money(dashboard.escrow.releasedAmount)} />
            <Row label={t('escrow.refunded')} value={money(dashboard.escrow.refundedAmount)} />
            <Row label={t('escrow.disputed')} value={String(dashboard.escrow.disputedHolds)} />
          </dl>
        </Panel>

        <Panel title={t('disputesHeading')} icon={<AlertTriangle aria-hidden className="size-4" />}>
          <dl className="flex flex-col gap-2 text-sm">
            <Row label={t('disputes.open')} value={String(dashboard.disputes.open)} />
            <Row label={t('disputes.underReview')} value={String(dashboard.disputes.underReview)} />
            <Row
              label={t('disputes.resolved')}
              value={String(dashboard.disputes.resolvedInWindow)}
            />
            <Row label={t('disputes.frozen')} value={money(dashboard.disputes.frozenAmount)} />
            <Row
              label={t('disputes.averageHours')}
              /* NULL means nothing was resolved in the window. Rendering it as
                 "0 h" would report instant resolutions that never happened. */
              value={
                dashboard.disputes.averageResolutionHours === null
                  ? t('notMeasured')
                  : t('hours', {
                      count: Math.round(dashboard.disputes.averageResolutionHours),
                    })
              }
            />
          </dl>
          <Link
            href="/app/admin/disputes"
            className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline"
          >
            {t('openDisputeWorkspace')}
          </Link>
        </Panel>

        <Panel title={t('sosHeading')} icon={<Activity aria-hidden className="size-4" />}>
          {dashboard.sos.active > 0 ? (
            <div className="rounded-card border border-danger/30 bg-danger/5 p-3">
              <StatusBadge
                tone="danger"
                size="sm"
                label={t('sos.activeCount', { count: dashboard.sos.active })}
              />
              <p className="mt-2 text-sm text-muted-foreground">{t('sos.activeBody')}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('sos.none')}</p>
          )}
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <Row label={t('sos.raised')} value={String(dashboard.sos.raisedInWindow)} />
            <Row label={t('sos.resolved')} value={String(dashboard.sos.resolvedInWindow)} />
            <Row
              label={t('sos.lastRaised')}
              value={formatDateTime(dashboard.sos.lastRaisedAt, locale) ?? t('never')}
            />
          </dl>
        </Panel>
      </section>

      <section>
        <Panel
          title={t('healthHeading')}
          icon={<HeartPulse aria-hidden className="size-4" />}
          action={
            <StatusBadge
              tone={
                dashboard.health.status === 'OK'
                  ? 'success'
                  : dashboard.health.status === 'DEGRADED'
                    ? 'warning'
                    : 'danger'
              }
              size="sm"
              label={t(`health.${dashboard.health.status}`)}
            />
          }
        >
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <Row
              label={t('health.database')}
              value={
                dashboard.health.databaseUp
                  ? t('health.upWithLatency', { ms: dashboard.health.databaseLatencyMs ?? 0 })
                  : t('health.down')
              }
            />
            <Row
              label={t('health.failedNotifications')}
              value={String(dashboard.health.failedNotifications)}
            />
            <Row
              label={t('health.stalePayments')}
              value={String(dashboard.health.stalePendingTransactions)}
            />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">{t('health.caveat')}</p>
        </Panel>
      </section>
    </div>
  );
}

function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-heading text-sm font-semibold text-foreground">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-numeric font-medium text-foreground">{value}</dd>
    </div>
  );
}
