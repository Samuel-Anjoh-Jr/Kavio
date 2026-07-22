'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatXaf } from '@/lib/discovery';
import { downloadCsv, type AdminWindow } from '@/lib/admin';
import {
  ADMIN_ANALYTICS_QUERY,
  type AdminAnalytics,
  type AdminAnalyticsQueryResult,
} from '@/lib/graphql/admin';
import { BarBreakdown, TimeSeriesChart } from './charts';
import { WindowPicker } from './window-picker';

/**
 * Analytics & Reports (ADM-07): user growth, jobs over time, jobs by category
 * and location, revenue by source, trust-score distribution, top performers —
 * with export.
 *
 * The export is built HERE, from the query this screen already holds, rather
 * than from a server-side report endpoint. A separate exporter would be a second
 * implementation of every aggregate on this page, free to drift from it, and an
 * export that disagrees with the dashboard it came from is worse than none.
 */
export function AdminAnalyticsScreen() {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const [windowDays, setWindowDays] = useState<AdminWindow>(30);

  const { data, loading, error } = useQuery<AdminAnalyticsQueryResult>(ADMIN_ANALYTICS_QUERY, {
    variables: { windowDays },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });

  const analytics = data?.adminAnalytics;
  const money = (value: number) => formatXaf(value, locale) ?? '—';

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-52 w-full rounded-card" />
        <Skeleton className="h-52 w-full rounded-card" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
        {error ? t('loadError') : t('noData')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WindowPicker value={windowDays} onChange={setWindowDays} />
        <Button variant="outline" size="sm" onClick={() => exportReport(analytics, t)}>
          <Download aria-hidden />
          {t('exportCsv')}
        </Button>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        {analytics.series.map((series) => (
          <Panel key={series.key} title={t(`series.${series.key}`)}>
            <TimeSeriesChart
              points={series.points}
              label={t(`series.${series.key}`)}
              format={series.key === 'REVENUE' ? money : undefined}
            />
          </Panel>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title={t('jobsByCategory')}>
          <BarBreakdown slices={analytics.jobsByCategory} emptyLabel={t('noCategoryData')} />
        </Panel>

        <Panel title={t('jobsByLocation')}>
          <BarBreakdown slices={analytics.jobsByLocation} emptyLabel={t('noLocationData')} />
        </Panel>

        <Panel title={t('revenueBySource')}>
          <BarBreakdown
            slices={analytics.revenueBySource.map((slice) => ({
              ...slice,
              label: t(`paymentSource.${slice.label}`),
            }))}
            emptyLabel={t('noRevenueData')}
            format={money}
          />
        </Panel>

        <Panel title={t('trustDistribution')}>
          <BarBreakdown
            slices={analytics.trustScoreDistribution}
            emptyLabel={t('noTrustData')}
            max={10}
          />
          <p className="mt-3 text-xs text-muted-foreground">{t('trustDistributionCaption')}</p>
        </Panel>
      </section>

      <section>
        <Panel title={t('topPerformers')}>
          {analytics.topPerformers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('noPerformerData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th scope="col" className="pb-2 font-medium">
                      {t('performer.name')}
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      {t('performer.completed')}
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      {t('performer.rating')}
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      {t('performer.trust')}
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      {t('performer.earned')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.topPerformers.map((performer) => (
                    <tr key={performer.userId} className="border-b border-border/60 last:border-0">
                      <td className="py-2">
                        <Link
                          href={`/app/workers/${performer.userId}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {performer.name ?? t('unnamed')}
                        </Link>
                      </td>
                      <td className="py-2 font-numeric">{performer.completedJobs}</td>
                      {/* NULL means unrated. A leaderboard that prints 0.0 for
                          somebody nobody has reviewed is libelling them. */}
                      <td className="py-2 font-numeric">
                        {performer.averageRating === null
                          ? t('notMeasured')
                          : performer.averageRating.toFixed(1)}
                      </td>
                      <td className="py-2 font-numeric">{performer.trustScore}</td>
                      <td className="py-2 text-right font-numeric">{money(performer.earned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}

/**
 * One CSV covering every section, with a `section` column.
 *
 * One file rather than six downloads: an operator exports to put the numbers in
 * a spreadsheet beside each other, and six files is six imports before they can
 * start.
 */
function exportReport(analytics: AdminAnalytics, t: (key: string) => string): void {
  const rows: (string | number | null)[][] = [
    [t('csv.section'), t('csv.key'), t('csv.label'), t('csv.value')],
  ];

  for (const series of analytics.series) {
    for (const point of series.points) {
      rows.push([t('csv.series'), series.key, point.bucket, point.value]);
    }
  }

  const breakdowns: [string, AdminAnalytics['jobsByCategory']][] = [
    ['jobsByCategory', analytics.jobsByCategory],
    ['jobsByLocation', analytics.jobsByLocation],
    ['revenueBySource', analytics.revenueBySource],
    ['trustScoreDistribution', analytics.trustScoreDistribution],
  ];

  for (const [key, slices] of breakdowns) {
    for (const slice of slices) {
      rows.push([t('csv.breakdown'), key, slice.label, slice.value]);
    }
  }

  for (const performer of analytics.topPerformers) {
    rows.push([t('csv.topPerformers'), performer.userId, performer.name ?? '', performer.earned]);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsv(`trustpro-analytics-${analytics.windowDays}d-${stamp}.csv`, rows);
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}
