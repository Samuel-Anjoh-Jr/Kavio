'use client';

import { useTranslations } from 'next-intl';
import { BadgeCheck, Camera, IdCard, Phone, UserRound } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { TrustNudge } from '@/lib/notification-hub';

const ICONS = { phone: Phone, photo: Camera, identity: IdCard, contact: UserRound } as const;

/**
 * Story-style cards for the trust steps still to do ("2 of 4 done"), at the
 * top of the notification hub. Hidden once every step is done.
 */
export function TrustStories({ nudges }: { nudges: TrustNudge[] }) {
  const t = useTranslations('Notifications.hub');
  const pending = nudges.filter((n) => !n.done);
  if (pending.length === 0) return null;
  const done = nudges.length - pending.length;
  return (
    <section aria-labelledby="trust-steps">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="trust-steps" className="text-sm font-semibold text-foreground">
          {t('nudgesTitle')}
        </h2>
        <span className="font-numeric text-xs font-medium text-muted-foreground">
          {t('nudgesProgress', { done, total: nudges.length })}
        </span>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 [scrollbar-width:none]">
        {pending.map((nudge) => {
          const Icon = ICONS[nudge.id];
          return (
            <Link
              key={nudge.id}
              href={nudge.href}
              className="flex w-36 shrink-0 snap-start flex-col rounded-card border border-primary/20 bg-primary/5 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="mb-3 inline-flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="text-sm font-semibold leading-tight text-foreground">
                {t(`nudges.${nudge.id}.title`)}
              </span>
              <span className="mt-1 text-xs leading-snug text-muted-foreground">
                {t(`nudges.${nudge.id}.body`)}
              </span>
            </Link>
          );
        })}
        {done > 0 ? (
          <div className="flex w-28 shrink-0 flex-col items-center justify-center rounded-card border border-dashed border-border p-3 text-center">
            <BadgeCheck aria-hidden className="mb-1 size-5 text-success" />
            <span className="text-xs text-muted-foreground">{t('nudgesDone')}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
