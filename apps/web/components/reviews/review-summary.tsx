'use client';

import { useLocale, useTranslations } from 'next-intl';
import { REVIEW_RATING_MAX } from '@/lib/reviews';
import type { ReviewSummary } from '@/lib/graphql/reviews';
import { StarRatingDisplay } from './star-rating';

/**
 * The reviews summary on a profile (REV-02): average, distribution bars, count.
 *
 * An UNRATED subject shows "no reviews yet", never "0.0 ★". The API returns a
 * null average precisely so the two can be told apart, and collapsing them here
 * would undo that — a new worker displayed as a zero-rated one is the single
 * most damaging thing this component could do to somebody's livelihood.
 *
 * All five bars are always drawn, including empty ones: a distribution chart
 * that silently drops its zero rows misreports its own shape.
 */
export function ReviewSummaryPanel({ summary }: { summary: ReviewSummary }) {
  const t = useTranslations('Reviews');
  const locale = useLocale();

  const formatter = new Intl.NumberFormat(locale === 'fr' ? 'fr-CM' : 'en-CM', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  if (summary.total === 0 || summary.average === null) {
    return (
      <div className="rounded-card border border-dashed border-border bg-surface p-6 text-center">
        <p className="text-sm font-medium text-foreground">{t('summaryEmpty')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('summaryEmptyBody')}</p>
      </div>
    );
  }

  // Descending, so the chart reads 5★ at the top the way every rating summary
  // a user has ever seen does.
  const bars = [...summary.distribution].sort((a, b) => b.rating - a.rating);

  return (
    <div className="flex flex-col gap-6 rounded-card border border-border bg-surface p-6 sm:flex-row sm:items-center sm:gap-10">
      <div className="shrink-0 text-center sm:text-left">
        <p className="font-numeric text-5xl font-semibold text-foreground">
          {formatter.format(summary.average)}
        </p>
        <StarRatingDisplay rating={Math.round(summary.average)} className="mt-2" />
        <p className="mt-2 text-sm text-muted-foreground">
          {t('reviewCount', { count: summary.total })}
        </p>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {bars.map((bucket) => (
          <li key={bucket.rating} className="flex items-center gap-3">
            <span className="w-12 shrink-0 font-numeric text-xs text-muted-foreground">
              {t('starsShort', { rating: bucket.rating })}
            </span>
            <span
              role="img"
              aria-label={t('distributionAria', {
                rating: bucket.rating,
                max: REVIEW_RATING_MAX,
                count: bucket.count,
              })}
              className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
            >
              {/* Width only — a transform-based scale would blur the rounded cap.
                  No entry animation: this is a chart, not a reveal. */}
              <span
                className="block h-full rounded-full bg-warning"
                style={{ width: `${Math.round(bucket.share * 100)}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right font-numeric text-xs text-muted-foreground">
              {bucket.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
