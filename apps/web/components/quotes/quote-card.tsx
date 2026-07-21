'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Clock, Star } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { RemoteImage } from '@/components/ui/remote-image';
import { StatusBadge } from '@/components/ui/status-badge';
import { TierBadge } from '@/components/trust/tier-badge';
import { TrustScoreRing } from '@/components/trust/trust-score-ring';
import { formatRating, formatXaf, initials } from '@/lib/discovery';
import { formatDateTime } from '@/lib/datetime';
import { QUOTE_STATUS_TONE } from '@/lib/quotes';
import type { VerificationTier } from '@/lib/trust';
import type { Quote } from '@/lib/graphql/quotes';

/**
 * One quote, as it appears in either inbox (QTE-02, QTE-05).
 *
 * `showWorker` turns on the worker-context block the CLIENT needs to weigh an
 * offer — Trust Score ring, tier and rating sit next to the price, because the
 * decision is never price alone; it is price from THIS person. The worker's own
 * Sent/Drafts view leaves it off: they know who they are.
 */
export function QuoteCard({
  quote,
  showWorker = false,
  footer,
}: {
  quote: Quote;
  showWorker?: boolean;
  footer?: ReactNode;
}) {
  const t = useTranslations('Quotes');
  const locale = useLocale();

  const price = formatXaf(quote.price, locale);
  const rating = formatRating(quote.worker?.averageRating, locale);
  const timestamp = formatDateTime(quote.sentAt ?? quote.createdAt, locale);
  const counterRequested = quote.counterTargetPrice != null || quote.counterMessage != null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            {quote.jobTitle && (
              <Link
                href={`/app/jobs/${quote.jobId}`}
                className="text-sm font-medium text-foreground hover:text-primary hover:underline"
              >
                {quote.jobTitle}
              </Link>
            )}
            <span className="font-numeric text-2xl font-semibold text-foreground">{price}</span>
          </div>
          <StatusBadge tone={QUOTE_STATUS_TONE[quote.status]} label={t(`status.${quote.status}`)} />
        </div>

        {showWorker && quote.worker && (
          <div className="flex items-center gap-3 rounded-card border border-border bg-muted/40 p-3">
            <WorkerAvatar name={quote.worker.name} avatar={quote.worker.avatar} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">
                {quote.worker.name ?? t('worker')}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <TierBadge tier={quote.worker.tier as VerificationTier} size="sm" />
                {rating && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Star aria-hidden className="size-3 fill-warning text-warning" />
                    {rating}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {t('completedJobs', { count: quote.worker.completedJobs })}
                </span>
              </div>
            </div>
            <TrustScoreRing
              score={quote.worker.trustScore}
              tier={quote.worker.tier as VerificationTier}
              size="sm"
              showLabel={false}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {quote.durationValue && quote.durationUnit && (
            <span className="flex items-center gap-1.5">
              <Clock aria-hidden className="size-4" />
              {t('durationValue', {
                value: quote.durationValue,
                unit: t(`durationUnitShort.${quote.durationUnit}`),
              })}
            </span>
          )}
          {timestamp && <span className="font-numeric text-xs">{timestamp}</span>}
        </div>

        {quote.includes.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {quote.includes.map((item, index) => (
              <li
                key={`${item}-${index}`}
                className="flex items-start gap-2 text-sm text-foreground"
              >
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                {item}
              </li>
            ))}
          </ul>
        )}

        {quote.message && <p className="text-sm text-muted-foreground">{quote.message}</p>}

        {counterRequested && (
          <div className="rounded-card border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
            <p className="font-medium text-foreground">{t('counterRequested')}</p>
            {quote.counterTargetPrice != null && (
              <p className="text-muted-foreground">
                {t('counterTarget', { price: formatXaf(quote.counterTargetPrice, locale) ?? '' })}
              </p>
            )}
            {quote.counterMessage && (
              <p className="text-muted-foreground">{quote.counterMessage}</p>
            )}
          </div>
        )}

        {footer && <div className="flex flex-wrap gap-2 pt-1">{footer}</div>}
      </CardContent>
    </Card>
  );
}

function WorkerAvatar({ name, avatar }: { name: string | null; avatar: string | null }) {
  if (avatar) {
    return <RemoteImage src={avatar} alt="" className="size-10 rounded-full object-cover" />;
  }
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
      {initials(name)}
    </span>
  );
}
