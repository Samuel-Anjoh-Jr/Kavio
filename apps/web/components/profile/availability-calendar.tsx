'use client';

import { useTranslations } from 'next-intl';
import { CalendarOff } from 'lucide-react';
import type { WorkerAvailabilityDay, WorkerAvailabilityException } from '@/lib/graphql/discovery';
import { cn } from '@/lib/utils';

/**
 * Weekly availability with upcoming exceptions (PRO-05).
 *
 * A recurring RULE, not a calendar of instants: the API returns "Tuesdays,
 * 08:00–17:00", and the exceptions list is what overrides it on a specific date
 * ("Fête du Travail"). Rendering it as a month grid would imply we know about
 * every future day, which we do not.
 *
 * A closed day is shown rather than hidden. "Never works Sundays" is
 * information a client needs before they plan around it, and a seven-row block
 * with two greyed rows says that in one glance.
 */
export function AvailabilityCalendar({
  availability,
  exceptions,
}: {
  availability: WorkerAvailabilityDay[];
  exceptions: WorkerAvailabilityException[];
}) {
  const t = useTranslations('Profile');

  const days = [...availability].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const openDays = days.filter((day) => day.slots.length > 0).length;

  if (days.length === 0 || openDays === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
        <CalendarOff aria-hidden className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('availabilityEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
        {days.map((day) => {
          const closed = day.slots.length === 0;

          return (
            <li
              key={day.dayOfWeek}
              className={cn(
                'flex items-center justify-between gap-4 px-4 py-3 text-sm',
                closed ? 'bg-muted/40' : 'bg-surface',
              )}
            >
              <span
                className={cn('font-medium', closed ? 'text-muted-foreground' : 'text-foreground')}
              >
                {t(`day.${day.dayOfWeek}`)}
              </span>

              {closed ? (
                <span className="text-muted-foreground">{t('closed')}</span>
              ) : (
                <span className="font-numeric text-right text-foreground">
                  {day.slots
                    .map((slot) => t('slotRange', { start: slot.startTime, end: slot.endTime }))
                    .join(' · ')}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {exceptions.length > 0 && (
        <section>
          <h3 className="font-heading text-sm font-semibold text-foreground">
            {t('exceptionsHeading')}
          </h3>
          <ul className="mt-2 flex flex-col gap-2">
            {exceptions.map((exception) => (
              <li
                key={exception.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm"
              >
                <span className="font-numeric font-medium text-foreground">{exception.date}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    exception.isAvailable
                      ? 'bg-success/10 text-success'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {exception.isAvailable
                    ? exception.startTime && exception.endTime
                      ? t('slotRange', { start: exception.startTime, end: exception.endTime })
                      : t('openException')
                    : t('closed')}
                </span>
                {/* The worker's own words, shown verbatim — a localised label
                    would replace their reason with our guess at it. */}
                {exception.note && <span className="text-muted-foreground">{exception.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
