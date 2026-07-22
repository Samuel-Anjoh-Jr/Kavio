'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, ChevronRight, ShieldAlert } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDateTime } from '@/lib/datetime';
import { REPORT_STATUS_TONE, type ReportTargetType } from '@/lib/reports';
import {
  MODERATION_SUMMARY_QUERY,
  REPORT_QUEUE_QUERY,
  type ModerationSummaryQueryResult,
  type ReportGroup,
  type ReportQueueQueryResult,
} from '@/lib/graphql/moderation';
import { cn } from '@/lib/utils';

const TARGET_TYPES: readonly (ReportTargetType | 'ALL')[] = [
  'ALL',
  'WORKER_PROFILE',
  'JOB',
  'PORTFOLIO_ITEM',
  'MESSAGE',
  'BUSINESS_PROFILE',
  'REVIEW',
  'USER',
];

/**
 * The admin moderation queue (ADM-08): reports GROUPED BY ITEM.
 *
 * The grouping is the whole point — twelve complaints about one photo are one
 * row, ordered by how many reports it drew, so an admin works the items that most
 * users independently flagged first rather than wading through duplicate
 * complaints. RBAC is the API's `admin:moderate` guard; the page role check is a
 * routing courtesy.
 */
export function ModerationQueue() {
  const t = useTranslations('Moderation');
  const [targetType, setTargetType] = useState<ReportTargetType | 'ALL'>('ALL');

  const { data: summaryData } = useQuery<ModerationSummaryQueryResult>(MODERATION_SUMMARY_QUERY, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const { data, loading } = useQuery<ReportQueueQueryResult>(REPORT_QUEUE_QUERY, {
    variables: {
      status: ['OPEN', 'REVIEWING'],
      targetType: targetType === 'ALL' ? null : targetType,
      limit: 30,
    },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });

  const groups = data?.reportQueue ?? [];
  const summary = summaryData?.moderationSummary;

  return (
    <div className="flex flex-col gap-5">
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <SummaryTile label={t('summary.openGroups')} value={summary.openGroups} tone="warning" />
          <SummaryTile label={t('summary.openReports')} value={summary.openReports} tone="danger" />
          <SummaryTile
            label={t('summary.reviewingGroups')}
            value={summary.reviewingGroups}
            tone="primary"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {TARGET_TYPES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={targetType === value}
            onClick={() => setTargetType(value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              targetType === value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input bg-surface text-muted-foreground hover:bg-muted',
            )}
          >
            {value === 'ALL' ? t('allTypes') : t(`targetType.${value}`)}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-28 w-full rounded-card" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-16 text-center">
          <ShieldAlert aria-hidden className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t('queueEmpty')}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t('queueEmptyBody')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <GroupRow key={`${group.target.targetType}:${group.target.targetId}`} group={group} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GroupRow({ group }: { group: ReportGroup }) {
  const t = useTranslations('Moderation');
  const tr = useTranslations('Report');
  const locale = useLocale();
  const { target, reportedUser } = group;

  return (
    <li>
      <Link href={`/app/admin/reports/${target.targetType}/${target.targetId}`} className="block">
        <Card className="transition-colors hover:border-primary/40">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  size="sm"
                  tone="neutral"
                  label={t(`targetType.${target.targetType}`)}
                />
                <StatusBadge
                  size="sm"
                  tone={REPORT_STATUS_TONE[group.status]}
                  label={t(`status.${group.status}`)}
                />
                {group.openCount > 1 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                    <AlertTriangle aria-hidden className="size-3" />
                    {t('reportsAbout', { count: group.openCount })}
                  </span>
                )}
              </div>

              <p className="mt-1.5 line-clamp-1 text-sm font-medium text-foreground">
                {target.label ||
                  (target.exists ? t(`targetType.${target.targetType}`) : t('itemRemoved'))}
              </p>
              {target.excerpt && (
                <p className="line-clamp-1 text-sm text-muted-foreground">{target.excerpt}</p>
              )}

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {reportedUser && (
                  <span className="truncate">
                    {reportedUser.name}
                    {reportedUser.priorActionCount > 0 &&
                      ` · ${t('priorActions', { count: reportedUser.priorActionCount })}`}
                  </span>
                )}
                <span>
                  {group.reasons
                    .slice(0, 3)
                    .map((reason) => tr(`reason.${reason}`))
                    .join(', ')}
                </span>
                <span className="font-numeric">{formatDateTime(group.lastReportedAt, locale)}</span>
              </div>
            </div>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
    </li>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'warning' | 'danger' | 'primary';
}) {
  const toneClass = {
    warning: 'text-warning',
    danger: 'text-danger',
    primary: 'text-primary',
  }[tone];

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className={cn('font-numeric text-2xl font-semibold tabular-nums', toneClass)}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
