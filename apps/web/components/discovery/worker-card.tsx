'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bookmark, BriefcaseBusiness, MapPin, Star } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { RemoteImage } from '@/components/ui/remote-image';
import { Skeleton } from '@/components/ui/skeleton';
import { TrustScoreRing } from '@/components/trust/trust-score-ring';
import { TierBadge } from '@/components/trust/tier-badge';
import { useRequireAuth } from '@/components/auth/require-auth';
import { formatDistance } from '@/lib/geo';
import { formatRating, formatXaf, initials, type WorkerCardData } from '@/lib/discovery';
import { cardHoverIn, cardHoverOut, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * The Worker Card (DIS-02) — the unit of discovery, reused by search, the guest
 * home, the map list and every "workers near you" rail.
 *
 * What it puts on screen, in the order somebody scanning actually uses:
 * WHO (photo, name, trade) → CAN I TRUST THEM (Trust Score ring, tier badge) →
 * WHAT DOES IT COST → HOW FAR. Trust sits above price on purpose; the moat is
 * trust, not the listing.
 *
 * ── Two things this card refuses to render ──────────────────────────────────
 * A rating of zero, and a portfolio strip with no portfolio. `averageRating` is
 * NULL for an unrated worker, and "0.0 ★" reads as terrible rather than new —
 * so a new worker gets a "new" label instead. Likewise the portfolio preview
 * appears only when images were actually supplied; a row of grey placeholder
 * boxes would imply evidence that does not exist, on the one signal survey
 * respondents ranked highest.
 */

export interface WorkerCardProps {
  worker: WorkerCardData;
  /** Renders the compact variant used inside map popups and dense rails. */
  compact?: boolean;
  className?: string;
}

export function WorkerCard({ worker, compact = false, className }: WorkerCardProps) {
  const t = useTranslations('WorkerCard');
  const locale = useLocale();
  const requireAuth = useRequireAuth();
  const reducedMotion = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);

  const name = worker.name ?? t('unnamed');
  const distance = formatDistance(worker.distanceM, (key, values) => t(`distance.${key}`, values));
  const price = formatXaf(worker.priceFrom, locale);
  const rating = formatRating(worker.averageRating, locale);
  const profileHref = `/app/workers/${worker.userId}`;

  // A worker with no completed jobs and no rating is NEW, which is a different
  // thing from being bad at the job. Saying so protects the supply side we are
  // trying to onboard.
  const isNew = worker.averageRating === null && worker.completedJobs === 0;

  const portfolio = worker.portfolioPreview ?? [];
  const visiblePortfolio = expanded ? portfolio.slice(0, 6) : portfolio.slice(0, 3);

  function onPointerEnter() {
    setExpanded(true);
    if (cardRef.current && !reducedMotion) cardHoverIn(cardRef.current);
  }

  function onPointerLeave() {
    setExpanded(false);
    if (cardRef.current && !reducedMotion) cardHoverOut(cardRef.current);
  }

  return (
    <div
      ref={cardRef}
      // Hover expands on a pointer device; the toggle button below is what
      // touch and keyboard users get, because there is no hover on a phone.
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(
        'group relative flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {worker.avatar ? (
          <RemoteImage
            src={worker.avatar}
            alt=""
            className="size-14 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-full border border-border bg-muted font-heading text-lg font-semibold text-muted-foreground"
          >
            {initials(worker.name)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-heading text-base font-semibold text-foreground">
            {/* The whole card is reachable through this one link: a card-wide
                anchor would swallow the save button and the profile tabs. */}
            <Link
              href={profileHref}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {name}
            </Link>
          </h3>

          {worker.headline && (
            <p className="truncate text-sm text-muted-foreground">{worker.headline}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TierBadge tier={worker.tier} size="sm" />
            {isNew && (
              <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                {t('new')}
              </span>
            )}
          </div>
        </div>

        {!compact && (
          <TrustScoreRing
            score={worker.trustScore}
            tier={worker.tier}
            size="sm"
            showLabel={false}
            className="shrink-0"
          />
        )}
      </div>

      {portfolio.length > 0 && (
        <ul className="flex gap-2 overflow-hidden" aria-label={t('portfolioLabel')}>
          {visiblePortfolio.map((url) => (
            <li key={url} className="min-w-0 flex-1">
              <RemoteImage
                src={url}
                alt=""
                className="aspect-square w-full rounded-image object-cover"
              />
            </li>
          ))}
        </ul>
      )}

      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {price ? (
          <div className="flex items-baseline gap-1">
            <dt className="text-muted-foreground">{t('priceFrom')}</dt>
            <dd className="font-numeric font-semibold text-foreground">{price}</dd>
          </div>
        ) : (
          <div>
            <dt className="sr-only">{t('priceFrom')}</dt>
            {/* "Ask" is honest for genuinely variable work — better than a
                fabricated "from 0 FCFA". */}
            <dd className="text-muted-foreground">{t('priceOnRequest')}</dd>
          </div>
        )}

        {distance && (
          <div className="flex items-center gap-1">
            <dt className="sr-only">{t('distanceLabel')}</dt>
            <dd className="flex items-center gap-1 font-numeric text-muted-foreground">
              <MapPin aria-hidden className="size-3.5" />
              {distance}
            </dd>
          </div>
        )}

        {rating && (
          <div className="flex items-center gap-1">
            <dt className="sr-only">{t('ratingLabel')}</dt>
            <dd className="flex items-center gap-1 font-numeric text-muted-foreground">
              <Star aria-hidden className="size-3.5 fill-warning text-warning" />
              {rating}
            </dd>
          </div>
        )}
      </dl>

      {/* The expanded detail. Rendered inert rather than unmounted so a screen
          reader can reach it through the toggle without a hover it cannot
          perform. */}
      <div
        id={`worker-card-detail-${worker.userId}`}
        hidden={!expanded}
        className="border-t border-border pt-3 text-sm text-muted-foreground"
      >
        <p className="flex items-center gap-2">
          <BriefcaseBusiness aria-hidden className="size-4" />
          {t('completedJobs', { count: worker.completedJobs })}
        </p>
        {worker.matchedServiceName && (
          <p className="mt-1">
            {worker.matchedServiceCount > 1
              ? t('matchedServices', {
                  service: worker.matchedServiceName,
                  count: worker.matchedServiceCount - 1,
                })
              : t('matchedService', { service: worker.matchedServiceName })}
          </p>
        )}
      </div>

      <div className="relative z-10 flex items-center gap-2">
        <Link
          href={profileHref}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-button bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('viewProfile')}
        </Link>

        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`worker-card-detail-${worker.userId}`}
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex h-10 items-center rounded-button border border-input px-3 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
        >
          {expanded ? t('less') : t('more')}
        </button>

        {/* Saving is a state-changing action, so a guest is bounced to auth and
            returned here (ACC-02). The optimistic flip is reverted by the gate
            returning false. */}
        <button
          type="button"
          aria-pressed={saved}
          aria-label={saved ? t('unsave', { name }) : t('save', { name })}
          onClick={() =>
            requireAuth('save_favorite', () => setSaved((value) => !value), {
              payload: { userId: worker.userId },
            })
          }
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-button border border-input text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bookmark aria-hidden className={cn('size-4', saved && 'fill-primary text-primary')} />
        </button>
      </div>
    </div>
  );
}

/** Skeleton matching the card's real geometry, so the list does not jump on load. */
export function WorkerCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-14 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className="size-14 shrink-0 rounded-full" />
      </div>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-10 w-full rounded-button" />
    </div>
  );
}
