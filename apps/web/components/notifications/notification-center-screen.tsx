'use client';

import { useCallback, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { Bell, CheckCheck, Settings } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RequireAuthNotice } from '@/components/messaging/require-auth-notice';
import { useToast } from '@/components/ui/use-toast';
import { formatDateTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import {
  CATEGORY_TONE,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_FILTERS,
  type NotificationFilter,
} from '@/lib/notifications';
import { navigateToNotification } from '@/lib/notification-navigation';
import {
  NOTIFICATIONS_QUERY,
  type NotificationsQueryResult,
  type AppNotification,
} from '@/lib/graphql/notifications';

const TONE_DOT: Record<string, string> = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/**
 * The Notification Center (NOT-02): All / Unread / Important filters, mark-as-read
 * (per-row and all), a category dot, and a deep link into the surface each notice
 * is about. Reads are GraphQL; marking read is a REST write.
 *
 * Clicking a row marks it read AND follows its deep link — the two things a
 * person means by "I've dealt with this" — so a notice never sits unread after
 * it has been acted on.
 */
export function NotificationCenterScreen() {
  const t = useTranslations('Notifications');
  const tRoles = useTranslations('Roles');
  const locale = useLocale();
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const { toast } = useToast();

  const [filter, setFilter] = useState<NotificationFilter>('ALL');

  const { data, loading, refetch } = useQuery<NotificationsQueryResult>(NOTIFICATIONS_QUERY, {
    variables: { filter, limit: 30 },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    skip: status !== 'authenticated',
  });

  const feed = data?.myNotifications;
  const items = feed?.items ?? [];

  const onOpen = useCallback(
    async (notification: AppNotification) => {
      if (!notification.readAt) {
        await markNotificationRead(notification.id).catch(() => undefined);
        void refetch();
      }
      await navigateToNotification({
        notification,
        activeRole: session?.user?.activeRole,
        roles: session?.user?.roles,
        refreshSession: update,
        navigate: (path) => router.push(path),
        onRoleSwitched: (role) =>
          toast({ title: tRoles('switched', { role: tRoles(`names.${role}`) }) }),
      });
    },
    [refetch, router, session, update, toast, tRoles],
  );

  const onMarkAll = useCallback(async () => {
    await markAllNotificationsRead().catch(() => undefined);
    void refetch();
  }, [refetch]);

  if (status === 'unauthenticated') {
    return <RequireAuthNotice titleKey="auth.title" bodyKey="auth.body" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label={t('settings.title')}>
          <Link href="/app/settings/notifications">
            <Settings aria-hidden />
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2" role="tablist" aria-label={t('title')}>
          {NOTIFICATION_FILTERS.map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filter === key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-surface text-muted-foreground hover:bg-muted',
              )}
            >
              {t(`filter.${key}`)}
            </button>
          ))}
        </div>
        {(feed?.unreadCount ?? 0) > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void onMarkAll()} className="gap-1.5">
            <CheckCheck aria-hidden className="size-4" />
            {t('markAllRead')}
          </Button>
        )}
      </div>

      {loading && items.length === 0 ? (
        <NotificationSkeleton />
      ) : items.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border">
          {items.map((notification) => (
            <li key={notification.id}>
              <button
                onClick={() => void onOpen(notification)}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted',
                  notification.readAt ? 'bg-surface' : 'bg-primary/5',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    TONE_DOT[CATEGORY_TONE[notification.category]] ?? 'bg-muted-foreground',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'truncate text-sm',
                        notification.readAt
                          ? 'font-medium text-foreground'
                          : 'font-semibold text-foreground',
                      )}
                    >
                      {notification.title}
                    </span>
                    {notification.important && (
                      <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                        {t('filter.IMPORTANT')}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {notification.body}
                  </span>
                  <span className="mt-1 block font-numeric text-xs text-muted-foreground">
                    {formatDateTime(notification.createdAt, locale)}
                  </span>
                </span>
                {!notification.readAt && (
                  <span
                    aria-label="unread"
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ filter }: { filter: NotificationFilter }) {
  const t = useTranslations('Notifications');
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-16 text-center">
      <Bell aria-hidden className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{t(`empty.${filter}`)}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{t('empty.body')}</p>
    </div>
  );
}

function NotificationSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-start gap-3 rounded-card border border-border p-4">
          <Skeleton className="mt-1 size-2 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
