'use client';

import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Inbox } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatXaf } from '@/lib/discovery';
import {
  MY_JOB_INVITATIONS_QUERY,
  MY_JOBS_QUERY,
  type MyJobInvitationsQueryResult,
  type MyJobsQueryResult,
} from '@/lib/graphql/jobs';
import {
  MY_BOOKINGS_QUERY,
  MY_QUOTES_QUERY,
  type MyBookingsQueryResult,
  type MyQuotesQueryResult,
} from '@/lib/graphql/quotes';
import { WALLET_QUERY, type WalletQueryResult } from '@/lib/graphql/payments';
import { PendingPanel, StatCard } from './home-primitives';

/**
 * Real data for the role homes' pipeline panels (JOB-03, JOB-04, QTE-*,
 * PAY-*). These replace the placeholder `PendingPanel` copy from before those
 * modules existed — the panels are honestly EMPTY when there is nothing yet,
 * never a permanent "not available".
 */

const ACTIVE_BOOKING_STATUSES = new Set(['PAID', 'ACCEPTED', 'IN_PROGRESS']);

export function WorkerJobRequestsPanel() {
  const t = useTranslations('RoleHome');
  const { data, loading } = useQuery<MyJobInvitationsQueryResult>(MY_JOB_INVITATIONS_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) return <Skeleton className="h-24 w-full rounded-card" />;

  const pending = (data?.myJobInvitations ?? []).filter((i) => i.status === 'PENDING');

  if (pending.length === 0) {
    return (
      <PendingPanel
        icon={<Inbox aria-hidden className="size-5" />}
        title={t('worker.requestsEmptyTitle')}
        body={t('worker.requestsEmptyBody')}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {pending.slice(0, 3).map((invitation) => (
        <li
          key={invitation.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {invitation.jobTitle || t('worker.untitledJob')}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {invitation.client?.name ?? t('worker.unknownClient')}
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/app/jobs/${invitation.jobId}`}>{t('worker.viewRequest')}</Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function WorkerPipelinePanel() {
  const t = useTranslations('RoleHome');
  const { data: quotesData, loading: quotesLoading } = useQuery<MyQuotesQueryResult>(
    MY_QUOTES_QUERY,
    { fetchPolicy: 'cache-and-network' },
  );
  const { data: bookingsData, loading: bookingsLoading } = useQuery<MyBookingsQueryResult>(
    MY_BOOKINGS_QUERY,
    { fetchPolicy: 'cache-and-network' },
  );

  if ((quotesLoading && !quotesData) || (bookingsLoading && !bookingsData)) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
      </div>
    );
  }

  const sentCount = quotesData?.myQuotes.sent.length ?? 0;
  const activeCount = (bookingsData?.myBookings ?? []).filter((b) =>
    ACTIVE_BOOKING_STATUSES.has(b.status),
  ).length;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link
        href="/app/quotes"
        className="rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <StatCard
          label={t('worker.quotesPendingTitle')}
          value={String(sentCount)}
          hint={t('worker.quotesHint')}
        />
      </Link>
      <StatCard
        label={t('worker.activeJobsPendingTitle')}
        value={String(activeCount)}
        hint={t('worker.activeJobsHint')}
      />
    </div>
  );
}

export function WorkerEarningsPanel() {
  const t = useTranslations('RoleHome');
  const locale = useLocale();
  const { data, loading } = useQuery<WalletQueryResult>(WALLET_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) return <Skeleton className="h-24 w-full rounded-card" />;

  const wallet = data?.wallet;

  return (
    <Link
      href="/app/wallet"
      className="rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <StatCard
        label={t('worker.earningsPendingTitle')}
        value={wallet ? (formatXaf(wallet.availableBalance, locale) ?? '—') : '—'}
        hint={t('worker.earningsHint')}
      />
    </Link>
  );
}

export function ClientJobsPanel() {
  const t = useTranslations('RoleHome');
  const tJob = useTranslations('JobDetail');
  const { data, loading } = useQuery<MyJobsQueryResult>(MY_JOBS_QUERY, {
    variables: { pageSize: 3 },
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) return <Skeleton className="h-24 w-full rounded-card" />;

  const jobs = data?.myJobs.jobs ?? [];

  if (jobs.length === 0) {
    return (
      <PendingPanel
        title={t('client.postedJobsEmptyTitle')}
        body={t('client.postedJobsEmptyBody')}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {jobs.map((job) => (
        <li key={job.id}>
          <Link
            href={`/app/jobs/${job.id}`}
            className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 truncate font-medium text-foreground">
              {job.title || t('client.untitledJob')}
            </span>
            <span className="shrink-0 text-sm text-muted-foreground">
              {tJob(`status.${job.status}`)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ClientQuotesPanel() {
  const t = useTranslations('RoleHome');
  const { data, loading } = useQuery<MyBookingsQueryResult>(MY_BOOKINGS_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) return <Skeleton className="h-24 w-full rounded-card" />;

  const activeCount = (data?.myBookings ?? []).filter((b) =>
    ACTIVE_BOOKING_STATUSES.has(b.status),
  ).length;

  return (
    <Link
      href="/app/quotes"
      className="rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <StatCard
        label={t('client.quotesPendingTitle')}
        value={String(activeCount)}
        hint={t('client.quotesHint')}
      />
    </Link>
  );
}
