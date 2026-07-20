'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const noopSubscribe = () => () => {};

/**
 * Light/dark toggle. `mounted` is synced via useSyncExternalStore (false on
 * the server, true on the client) so the icon renders a neutral placeholder
 * for the server-rendered pass — next-themes only resolves `resolvedTheme`
 * after hydration, so guessing would cause a mismatch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('ThemeToggle');
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={t(isDark ? 'switchToLight' : 'switchToDark')}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-button border border-border bg-surface text-surface-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {mounted && isDark ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}
