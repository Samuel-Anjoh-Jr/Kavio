'use client';

import { useSession, signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Bookmark, LifeBuoy, LogOut, Search, Settings, ShieldCheck, UserRound } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { RoleSwitcher } from './role-switcher';
import { cn } from '@/lib/utils';

/**
 * Primary navigation for the app shell.
 *
 * Guests get the same chrome with a sign-in call to action instead of the Role
 * Switcher — the guest first-interface is a real browsing experience, not a
 * stripped-down teaser (ACC-01).
 */
export function AppHeader() {
  const t = useTranslations('Nav');
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const isAuthenticated = status === 'authenticated';
  // The admin surfaces are reachable by URL for anyone the API authorises, but
  // only an ADMIN grant puts them in the menu — the nav is a convenience, never
  // the access control, which is enforced server-side on every admin read/write.
  const isAdmin = session?.user?.roles?.includes('ADMIN') ?? false;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/app"
          className="rounded-input font-heading text-lg font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          TrustPro
        </Link>

        <nav aria-label={t('primary')} className="hidden items-center gap-1 xl:flex">
          <HeaderLink href="/app/explore" active={pathname.startsWith('/app/explore')}>
            {t('explore')}
          </HeaderLink>
          <HeaderLink href="/app/jobs" active={pathname.startsWith('/app/jobs')}>
            {t('jobs')}
          </HeaderLink>
          {isAuthenticated ? (
            <HeaderLink href="/app/messages" active={pathname.startsWith('/app/messages')}>
              {t('messages')}
            </HeaderLink>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/app/explore"
            aria-label={t('search')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-button text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden"
          >
            <Search aria-hidden />
          </Link>

          <div className="hidden sm:block">
            <LocaleSwitcher />
          </div>
          <ThemeToggle />

          {isAuthenticated ? (
            <>
              <NotificationBell />
              <RoleSwitcher />
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t('account')}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-input bg-surface text-surface-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserRound aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">
                    {session?.user?.name || session?.user?.email || t('account')}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/app/home">{t('home')}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/app/saved">
                      <Bookmark aria-hidden className="mr-2" />
                      {t('saved')}
                    </Link>
                  </DropdownMenuItem>
                  {/* Safety must be reachable in minimal taps (NFR-UX-01, SOS-03).
                      The press-and-hold SOS control itself lives on the job
                      surfaces where an engagement is actually happening; this is
                      the route to contacts, history and the safety guidance. */}
                  <DropdownMenuItem asChild>
                    <Link href="/app/safety">
                      <LifeBuoy aria-hidden className="mr-2" />
                      {t('safety')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/app/settings/notifications">
                      <Settings aria-hidden className="mr-2" />
                      {t('settings')}
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t('adminSection')}
                      </DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link href="/app/admin/disputes">
                          <ShieldCheck aria-hidden className="mr-2" />
                          {t('adminDisputes')}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/app/admin/reports">
                          <ShieldCheck aria-hidden className="mr-2" />
                          {t('adminReports')}
                        </Link>
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void signOut({ callbackUrl: '/' })}>
                    <LogOut aria-hidden className="mr-2" />
                    {t('signOut')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/auth/login">{t('signIn')}</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-button px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </Link>
  );
}
