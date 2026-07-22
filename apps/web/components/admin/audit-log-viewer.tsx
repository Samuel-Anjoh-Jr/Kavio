'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/datetime';
import { ADMIN_AUDIT_LOG_QUERY, type AdminAuditLogQueryResult } from '@/lib/graphql/admin';

const PAGE_SIZE = 50;

/**
 * The audit-log viewer (ADM-07).
 *
 * Read-only, and there is no write path to the log anywhere in the API — a log
 * an admin can edit is not an audit log. The `requestId` on each row is shown
 * because it is the join key into the structured application logs, which is what
 * turns "who changed the fee" into a full request trace.
 */
export function AuditLogViewer() {
  const t = useTranslations('Admin');
  const locale = useLocale();

  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);

  const { data, loading, error } = useQuery<AdminAuditLogQueryResult>(ADMIN_AUDIT_LOG_QUERY, {
    variables: { action: action || null, limit: PAGE_SIZE, offset },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });

  const page = data?.adminAuditLog;
  const actions = data?.adminAuditActions ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-action">{t('actionFilter')}</Label>
          <select
            id="audit-action"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setOffset(0);
            }}
            className="h-11 min-w-56 rounded-input border border-input bg-surface px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">{t('allActions')}</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full rounded-card" />
          <Skeleton className="h-14 w-full rounded-card" />
        </div>
      ) : error && !page ? (
        <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
          {t('loadError')}
        </p>
      ) : !page || page.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-14 text-center">
          <ScrollText aria-hidden className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t('noAuditEntries')}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t('auditCount', { count: page.total })}
          </p>

          <ul className="flex flex-col gap-2">
            {page.items.map((entry) => (
              <li key={entry.id} className="rounded-card border border-border bg-surface px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-numeric text-sm font-medium text-foreground">
                    {entry.action}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(entry.createdAt, locale)}
                  </span>
                </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  {t('auditActor', { name: entry.actorName ?? t('systemActor') })}
                  {entry.target ? ` · ${entry.target}` : ''}
                </p>

                {entry.requestId && (
                  <p className="mt-1 font-numeric text-xs text-muted-foreground">
                    {t('requestId', { id: entry.requestId })}
                  </p>
                )}

                {entry.meta !== null && entry.meta !== undefined && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-primary">
                      {t('showDetail')}
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-input bg-muted p-3 text-xs text-muted-foreground">
                      {JSON.stringify(entry.meta, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
            >
              {t('previous')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('pageRange', {
                from: offset + 1,
                to: offset + page.items.length,
                total: page.total,
              })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!page.hasMore}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              {t('next')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
