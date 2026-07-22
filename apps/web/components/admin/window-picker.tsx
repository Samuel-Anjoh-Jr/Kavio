'use client';

import { useTranslations } from 'next-intl';
import { ADMIN_WINDOWS, type AdminWindow } from '@/lib/admin';
import { cn } from '@/lib/utils';

/**
 * The time-range control, in one row above the charts (ADM-01, ADM-07).
 *
 * A closed set of windows rather than a date picker, because the API accepts
 * only these four — an arbitrary range would ask Postgres to bucket and densify
 * an unbounded number of days, which is an authenticated denial of service
 * wearing the costume of a filter.
 */
export function WindowPicker({
  value,
  onChange,
}: {
  value: AdminWindow;
  onChange: (window: AdminWindow) => void;
}) {
  const t = useTranslations('Admin');

  return (
    <div role="group" aria-label={t('windowLabel')} className="flex flex-wrap items-center gap-1.5">
      {ADMIN_WINDOWS.map((window) => (
        <button
          key={window}
          type="button"
          aria-pressed={value === window}
          onClick={() => onChange(window)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            value === window
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-input bg-surface text-muted-foreground hover:bg-muted',
          )}
        >
          {t(`window.${window}`)}
        </button>
      ))}
    </div>
  );
}
