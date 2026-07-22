'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Ban, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/datetime';
import { formatXaf } from '@/lib/discovery';
import { RISK_LEVEL_TONE, USER_STATUS_TONE, type AdminWindow } from '@/lib/admin';
import {
  ADMIN_HEATMAP_QUERY,
  ADMIN_RISK_QUERY,
  type AdminHeatmapQueryResult,
  type AdminRiskQueryResult,
  type RiskSignal,
} from '@/lib/graphql/admin';
import { ActivityHeatmap } from './activity-heatmap';
import { WindowPicker } from './window-picker';

/**
 * The Fraud & Risk monitor (ADM-06).
 *
 * Every level on this screen is DERIVED, never stored — the server recomputes it
 * from the underlying facts on each read. That is why each row shows its signals
 * rather than just a badge: a person surfaced here has not been judged, and an
 * admin about to act on them is entitled to see exactly what put them in the
 * list.
 *
 * Acting happens through the moderation workspace, which writes an append-only
 * action carrying the reason shown to the party and notifies them. This screen
 * links there rather than offering a quieter "block" button of its own.
 */
export function RiskMonitor() {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const [windowDays, setWindowDays] = useState<AdminWindow>(30);

  const { data, loading, error } = useQuery<AdminRiskQueryResult>(ADMIN_RISK_QUERY, {
    variables: { windowDays },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });

  const { data: heatmapData } = useQuery<AdminHeatmapQueryResult>(ADMIN_HEATMAP_QUERY, {
    variables: { windowDays },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const risk = data?.adminRiskMonitor;

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }

  if (!risk) {
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
        <Link
          href="/app/admin/reports"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {t('openReports', { count: risk.openReports })}
        </Link>
      </div>

      <section>
        <SectionHeading
          icon={<ShieldAlert aria-hidden className="size-4" />}
          title={t('highRiskHeading')}
          caption={t('highRiskCaption')}
        />

        {risk.highRiskAccounts.length === 0 ? (
          <Empty label={t('noRiskAccounts')} />
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {risk.highRiskAccounts.map((account) => (
              <li key={account.userId} className="rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/app/workers/${account.userId}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {account.name ?? t('unnamed')}
                      </Link>
                      <StatusBadge
                        tone={RISK_LEVEL_TONE[account.level]}
                        size="sm"
                        label={t(`riskLevel.${account.level}`)}
                      />
                      <StatusBadge
                        tone={USER_STATUS_TONE[account.status] ?? 'neutral'}
                        size="sm"
                        label={t(`userStatus.${account.status}`)}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {account.email ?? account.phone ?? t('noContact')} ·{' '}
                      {t('trustScoreLabel', { score: account.trustScore })} ·{' '}
                      {t('joined', { date: formatDate(account.createdAt, locale) ?? '' })}
                    </p>
                    <SignalList signals={account.signals} />
                  </div>

                  <Link
                    href={`/app/admin/reports/USER/${account.userId}`}
                    className="shrink-0 text-sm text-primary underline-offset-4 hover:underline"
                  >
                    {t('reviewInModeration')}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading
          icon={<ShieldAlert aria-hidden className="size-4" />}
          title={t('suspiciousJobsHeading')}
          caption={t('suspiciousJobsCaption')}
        />

        {risk.suspiciousJobs.length === 0 ? (
          <Empty label={t('noSuspiciousJobs')} />
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {risk.suspiciousJobs.map((job) => (
              <li key={job.jobId} className="rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/app/jobs/${job.jobId}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {job.title}
                      </Link>
                      <StatusBadge
                        tone={RISK_LEVEL_TONE[job.level]}
                        size="sm"
                        label={t(`riskLevel.${job.level}`)}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('postedBy', { name: job.posterName ?? t('unnamed') })}
                      {job.budgetMax !== null ? ` · ${formatXaf(job.budgetMax, locale) ?? ''}` : ''}
                    </p>
                    <SignalList signals={job.signals} />
                  </div>

                  <Link
                    href={`/app/admin/reports/JOB/${job.jobId}`}
                    className="shrink-0 text-sm text-primary underline-offset-4 hover:underline"
                  >
                    {t('reviewInModeration')}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading
          icon={<Ban aria-hidden className="size-4" />}
          title={t('blockedHeading')}
          caption={t('blockedCaption')}
        />

        {risk.blockedAccounts.length === 0 ? (
          <Empty label={t('noBlockedAccounts')} />
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {risk.blockedAccounts.map((account) => (
              <li
                key={`${account.userId}-${account.createdAt}`}
                className="rounded-card border border-border bg-surface px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {account.name ?? t('unnamed')}
                  </span>
                  <StatusBadge
                    tone={account.action === 'BAN' ? 'danger' : 'warning'}
                    size="sm"
                    label={t(`moderationAction.${account.action}`)}
                  />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{account.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('actionedBy', {
                    name: account.actorName ?? t('unnamed'),
                    date: formatDate(account.createdAt, locale) ?? '',
                  })}
                  {/* A ban has no expiry, and saying "expires —" would read as a
                      missing value rather than a permanent one. */}
                  {account.expiresAt
                    ? ` · ${t('until', { date: formatDate(account.expiresAt, locale) ?? '' })}`
                    : ` · ${t('permanent')}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading
          icon={<ShieldCheck aria-hidden className="size-4" />}
          title={t('heatmapHeading')}
          caption={t('heatmapCaptionIntro')}
        />
        <div className="mt-4">
          <ActivityHeatmap cells={heatmapData?.adminActivityHeatmap ?? []} />
        </div>
      </section>
    </div>
  );
}

/**
 * The facts behind a level, always shown.
 *
 * A badge alone would be a verdict with no evidence, which is exactly what this
 * monitor is built not to produce.
 */
function SignalList({ signals }: { signals: RiskSignal[] }) {
  const t = useTranslations('Admin');

  if (signals.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {signals.map((signal) => (
        <li
          key={signal.code}
          className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        >
          {t(`riskSignal.${signal.code}`, { count: signal.count })}
        </li>
      ))}
    </ul>
  );
}

function SectionHeading({
  icon,
  title,
  caption,
}: {
  icon: React.ReactNode;
  title: string;
  caption: string;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
        {icon}
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p className="mt-4 rounded-card border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
      {label}
    </p>
  );
}
