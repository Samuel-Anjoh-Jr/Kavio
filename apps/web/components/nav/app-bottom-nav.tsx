'use client';

import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Briefcase, Compass, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
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

  const items: { href: string; label: string; icon: LucideIcon }[] = [
    { href: '/app/explore', label: t('explore'), icon: Compass },
    { href: '/app/jobs', label: t('jobs'), icon: Briefcase },
    {
      href: status === 'authenticated' ? '/app/home' : '/auth/login',
      label: status === 'authenticated' ? t('home') : t('signIn'),
      icon: UserRound,
    },
  ];

  return (
    <nav
      aria-label={t('primary')}
      className="sticky bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
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
                <Icon aria-hidden className="size-5" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
