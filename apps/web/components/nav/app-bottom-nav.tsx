'use client';

import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Briefcase, Compass, MessageCircle, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { UNREAD_MESSAGES_QUERY, type UnreadMessagesQueryResult } from '@/lib/graphql/messaging';
import { cn } from '@/lib/utils';

/**
 * Phone-width primary navigation. Hidden from `md` up, where AppHeader's inline
 * nav takes over — so the two are never both announced to a screen reader.
 *
 * Sits above the iOS home indicator via `pb-[env(safe-area-inset-bottom)]`,
 * which matters once the PWA is installed and runs without browser chrome.
 */
export function AppBottomNav() {
  const t = useTranslations('Nav');
  const pathname = usePathname();
  const { status } = useSession();

  const isAuthenticated = status === 'authenticated';

  // Messages is the one bottom-nav destination that carries a count, so it is the
  // only one that queries. Guests never do (MSG threads require an account).
  const { data } = useQuery<UnreadMessagesQueryResult>(UNREAD_MESSAGES_QUERY, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    skip: !isAuthenticated,
    pollInterval: 60_000,
  });

  const unread = data?.unreadMessageCount ?? 0;

  const items: { href: string; label: string; icon: LucideIcon; badge?: number }[] = [
    { href: '/app/explore', label: t('explore'), icon: Compass },
    { href: '/app/jobs', label: t('jobs'), icon: Briefcase },
    // Messages sits in the thumb row because a booked job lives in the thread:
    // an unanswered message is how a hire quietly dies (MSG-01).
    ...(isAuthenticated
      ? [
          {
            href: '/app/messages',
            label: t('messages'),
            icon: MessageCircle,
            badge: unread,
          },
        ]
      : []),
    {
      href: isAuthenticated ? '/app/home' : '/auth/login',
      label: isAuthenticated ? t('home') : t('signIn'),
      icon: UserRound,
    },
  ];

  return (
    <nav
      aria-label={t('primary')}
      className="sticky bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname.startsWith(href);
          const showBadge = typeof badge === 'number' && badge > 0;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="relative">
                  <Icon aria-hidden className="size-5" />
                  {showBadge ? (
                    <span
                      // Purely decorative: the count is already in the link's
                      // accessible name below, so a screen reader is not told twice.
                      aria-hidden
                      className="absolute -right-2 -top-1 min-w-4 rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-danger-foreground"
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  ) : null}
                </span>
                <span>{label}</span>
                {showBadge ? <span className="sr-only">{`(${badge})`}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
