'use client';

import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  UNREAD_NOTIFICATIONS_QUERY,
  type UnreadNotificationsQueryResult,
} from '@/lib/graphql/notifications';

/**
 * The header notification bell with an unread badge (NOT-02).
 *
 * Polls on a gentle interval rather than opening a socket: the count is not
 * time-critical the way a live chat is, and a lightweight poll is cheaper than a
 * dedicated connection on a low-end phone. Push and the socket-driven inbox carry
 * the urgent path; this is the ambient "you have things waiting" signal.
 */
export function NotificationBell() {
  const t = useTranslations('Notifications');
  const { status } = useSession();

  const { data } = useQuery<UnreadNotificationsQueryResult>(UNREAD_NOTIFICATIONS_QUERY, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    skip: status !== 'authenticated',
    pollInterval: 60_000,
  });

  if (status !== 'authenticated') return null;

  const count = data?.unreadNotificationCount ?? 0;

  return (
    <Link
      href="/app/notifications"
      aria-label={count > 0 ? `${t('openBell')} (${count})` : t('openBell')}
      className="relative inline-flex size-10 items-center justify-center rounded-button text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Bell aria-hidden />
      {count > 0 && (
        <span className="absolute right-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-numeric font-semibold leading-4 text-danger-foreground tabular-nums">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
