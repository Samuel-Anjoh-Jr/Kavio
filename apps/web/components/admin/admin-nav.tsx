'use client';

import { useTranslations } from 'next-intl';
import {
  BarChart3,
  Bell,
  FolderTree,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCog,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const ITEMS: { href: string; key: string; icon: LucideIcon }[] = [
  { href: '/app/admin', key: 'dashboard', icon: LayoutDashboard },
  { href: '/app/admin/analytics', key: 'analytics', icon: BarChart3 },
  { href: '/app/admin/risk', key: 'risk', icon: ShieldAlert },
  { href: '/app/admin/users', key: 'users', icon: UserCog },
  { href: '/app/admin/reports', key: 'moderation', icon: ShieldCheck },
  { href: '/app/admin/featured', key: 'featured', icon: Sparkles },
  { href: '/app/admin/categories', key: 'categories', icon: FolderTree },
  { href: '/app/admin/marketing', key: 'marketing', icon: Megaphone },
  { href: '/app/admin/announcements', key: 'announcements', icon: Bell },
  { href: '/app/admin/audit', key: 'audit', icon: ScrollText },
  { href: '/app/admin/settings', key: 'settings', icon: Settings },
];

/**
 * The admin console's own navigation (ADM-01).
 *
 * A horizontal scroller rather than a fixed sidebar: the console is used on
 * laptops and on phones in the field, and a sidebar that collapses to a hamburger
 * hides the one thing an operator navigates by.
 *
 * `aria-current` marks the active item rather than colour alone, so the current
 * section is announced rather than merely tinted.
 */
export function AdminNav() {
  const t = useTranslations('Admin');
  const pathname = usePathname();

  return (
    <nav aria-label={t('navLabel')} className="border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {ITEMS.map((item) => {
          // Exact match for the dashboard root; prefix match elsewhere, so a
          // detail page keeps its section highlighted.
          const active =
            item.href === '/app/admin' ? pathname === item.href : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <item.icon aria-hidden className="size-4" />
                {t(`nav.${item.key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
