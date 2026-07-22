'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Search, Users } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { useDebouncedValue } from '@/components/discovery/use-debounced-value';
import { formatDate } from '@/lib/datetime';
import { USER_STATUS_TONE } from '@/lib/admin';
import { ADMIN_USERS_QUERY, type AdminUsersQueryResult } from '@/lib/graphql/admin';

const ROLES = ['WORKER', 'CLIENT', 'BUSINESS', 'AGENT', 'ADMIN'] as const;
const STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED'] as const;
const PAGE_SIZE = 20;

/**
 * The admin account directory (ADM-02): search, filter and open any account
 * type — users, workers, businesses, agents.
 *
 * ── Why there is no inline "suspend" here ───────────────────────────────────
 *
 * Suspending somebody is a moderation decision and it belongs in the moderation
 * workspace, where it writes an append-only action carrying the reason shown to
 * the person and notifies them (ADM-08). A one-click suspend on a search result
 * would be the same power with none of that record — which is the difference
 * between an audited platform and one that merely has an audit table.
 *
 * The directory therefore FINDS people and links to the surfaces that act.
 */
export function UserDirectory() {
  const t = useTranslations('Admin');
  const locale = useLocale();

  const [query, setQuery] = useState('');
  const [role, setRole] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [offset, setOffset] = useState(0);

  // Debounced: a query per keystroke across three indexed columns is a scan per
  // keystroke, and the operator is still typing.
  const debouncedQuery = useDebouncedValue(query, 300);

  const { data, loading, error } = useQuery<AdminUsersQueryResult>(ADMIN_USERS_QUERY, {
    variables: {
      query: debouncedQuery.trim() || null,
      role: role || null,
      status: status || null,
      limit: PAGE_SIZE,
      offset,
    },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });

  const page = data?.adminUsers;

  function resetTo(update: () => void) {
    update();
    // Any filter change invalidates the offset — page 3 of the old result set is
    // an arbitrary slice of the new one.
    setOffset(0);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="user-search">{t('searchLabel')}</Label>
          <div className="relative">
            <Search
              aria-hidden
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="user-search"
              value={query}
              placeholder={t('searchPlaceholder')}
              onChange={(event) => resetTo(() => setQuery(event.target.value))}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-role">{t('roleFilter')}</Label>
          <select
            id="user-role"
            value={role}
            onChange={(event) => resetTo(() => setRole(event.target.value))}
            className="h-11 rounded-input border border-input bg-surface px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">{t('allRoles')}</option>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {t(`role.${value}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-status">{t('statusFilter')}</Label>
          <select
            id="user-status"
            value={status}
            onChange={(event) => resetTo(() => setStatus(event.target.value))}
            className="h-11 rounded-input border border-input bg-surface px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">{t('allStatuses')}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`userStatus.${value}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
        </div>
      ) : error && !page ? (
        <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
          {t('loadError')}
        </p>
      ) : !page || page.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-14 text-center">
          <Users aria-hidden className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t('noAccounts')}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t('noAccountsBody')}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t('accountCount', { count: page.total })}
          </p>

          <ul className="flex flex-col gap-2">
            {page.items.map((user) => (
              <li key={user.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/app/workers/${user.id}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {user.name ?? t('unnamed')}
                      </Link>
                      <StatusBadge
                        tone={USER_STATUS_TONE[user.status] ?? 'neutral'}
                        size="sm"
                        label={t(`userStatus.${user.status}`)}
                      />
                      <StatusBadge tone="primary" size="sm" label={t(`tier.${user.tier}`)} />
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {user.email ?? user.phone ?? t('noContact')} ·{' '}
                      {t('trustScoreLabel', { score: user.trustScore })} ·{' '}
                      {t('joined', { date: formatDate(user.createdAt, locale) ?? '' })}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {user.roles.map((value) => t(`role.${value}`)).join(' · ')}
                    </p>

                    {(user.moderationActionCount > 0 || user.openReportCount > 0) && (
                      <p className="mt-1 text-xs text-warning">
                        {t('accountFlags', {
                          actions: user.moderationActionCount,
                          reports: user.openReportCount,
                        })}
                      </p>
                    )}
                  </div>

                  <Link
                    href={`/app/admin/reports/USER/${user.id}`}
                    className="shrink-0 text-sm text-primary underline-offset-4 hover:underline"
                  >
                    {t('manageAccount')}
                  </Link>
                </div>
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
