'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Flag } from 'lucide-react';
import { RemoteImage } from '@/components/ui/remote-image';
import { ReportDialog } from '@/components/moderation/report-dialog';
import { formatDate } from '@/lib/datetime';
import { initials } from '@/lib/discovery';
import type { ReviewListItem } from '@/lib/graphql/reviews';
import { StarRatingDisplay } from './star-rating';

/**
 * One review on a profile (REV-02).
 *
 * The job title is shown alongside the stars because it is the review's
 * credential: REV-02 ties every review to a real completed job, and naming that
 * job on the card is what makes the tie visible to the person reading it.
 *
 * Every card carries a report control (ADM-08). A review is the one piece of
 * content on a profile the profile's owner cannot edit or remove, so the route
 * to contest an unfair one has to be present on the card itself.
 */
export function ReviewCard({ review }: { review: ReviewListItem }) {
  const t = useTranslations('Reviews');
  const locale = useLocale();

  const author = review.authorName ?? t('anonymousAuthor');
  const date = formatDate(review.createdAt, locale);

  return (
    <li className="rounded-card border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground"
        >
          {initials(author)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-foreground">{author}</p>
            <ReportDialog
              targetType="REVIEW"
              targetId={review.id}
              reportedUserId={review.authorId}
              trigger={
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Flag aria-hidden className="size-3.5" />
                  {t('report')}
                </button>
              }
            />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StarRatingDisplay rating={review.rating} size="sm" />
            {date && <span className="text-xs text-muted-foreground">{date}</span>}
          </div>

          <p className="mt-1 truncate text-xs text-muted-foreground">
            {t('onJob', { job: review.jobTitle })}
          </p>

          {review.text && (
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-foreground">
              {review.text}
            </p>
          )}

          {review.photoUrls.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {review.photoUrls.map((url) => (
                <li key={url}>
                  <RemoteImage
                    src={url}
                    alt={t('photoAlt', { job: review.jobTitle })}
                    className="size-20 rounded-image object-cover"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
