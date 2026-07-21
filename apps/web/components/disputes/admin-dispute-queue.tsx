'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { MessageSquare } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDateTime } from '@/lib/datetime';
import {
  DISPUTE_RESOLUTION_TONE,
  DISPUTE_STATUS_TONE,
  DISPUTE_STATUSES,
  type DisputeStatus,
} from '@/lib/disputes';
import {
  DISPUTE_QUEUE_QUERY,
  type DisputeQueueItem,
  type DisputeQueueQueryResult,
} from '@/lib/graphql/disputes';
import { cn } from '@/lib/utils';

/**
 * The admin dispute queue (ADM-05): every dispute, filterable by status, each a
 * frozen escrow waiting on a decision.
 *
 * This is how an admin actually finds disputes to resolve. It defaults to the
 * OPEN lane because that is the backlog that matters — a frozen hold is a
 * client's money stuck until someone here acts. RBAC is enforced by the API's
 * `admin:dispute_resolve` guard on the read; the page-level role check is only a
 * routing courtesy.
 */
export function AdminDisputeQueue() {
  const t = useTranslations('Disputes');
  const [status, setStatus] = useState<DisputeStatus | null>('OPEN');

  const { data, loading, error } = useQuery<DisputeQueueQueryResult>(DISPUTE_QUEUE_QUERY, {
    variables: { status },
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  });

  const disputes = data?.disputeQueue ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={status === null} onClick={() => setStatus(null)}>
          {t('admin.filterAll')}
        </FilterChip>
        {DISPUTE_STATUSES.map((value) => (
          <FilterChip key={value} active={status === value} onClick={() => setStatus(value)}>
            {t(`status.${value}`)}
          </FilterChip>
        ))}
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
        </div>
      ) : error && !data ? (
        <p className="text-sm text-muted-foreground">{t('admin.loadError')}</p>
      ) : disputes.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('admin.empty')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {disputes.map((dispute) => (
            <QueueRow key={dispute.id} dispute={dispute} />
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueRow({ dispute }: { dispute: DisputeQueueItem }) {
  const t = useTranslations('Disputes');
  const locale = useLocale();

  return (
    <li>
      <Link href={`/app/admin/disputes/${dispute.id}`} className="block">
        <Card className="transition-colors hover:border-primary/40">
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex items-start justify-between gap-3">
              <p className="line-clamp-2 text-sm text-surface-foreground">{dispute.reason}</p>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <StatusBadge
                  size="sm"
                  tone={DISPUTE_STATUS_TONE[dispute.status]}
                  label={t(`status.${dispute.status}`)}
                />
                {dispute.resolution && (
                  <StatusBadge
                    size="sm"
                    tone={DISPUTE_RESOLUTION_TONE[dispute.resolution]}
                    label={t(`resolution.${dispute.resolution}`)}
                  />
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MessageSquare aria-hidden className="size-3.5" />
                {t('admin.messageCount', { count: dispute.messages.length })}
              </span>
              <span className="font-numeric">
                {t('openedOn', { date: formatDateTime(dispute.createdAt, locale) ?? '' })}
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>
    </li>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-input bg-surface text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
