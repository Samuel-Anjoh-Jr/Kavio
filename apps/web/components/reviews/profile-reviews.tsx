'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { MessageSquareQuote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  REVIEWS_QUERY,
  REVIEW_SUMMARY_QUERY,
  type ReviewSummaryQueryResult,
  type ReviewsQueryResult,
} from '@/lib/graphql/reviews';
import { ReviewCard } from './review-card';
import { ReviewSummaryPanel } from './review-summary';

/** Matches the API's default page size; its hard ceiling is 50. */
const PAGE_SIZE = 20;

/**
 * The reviews tab on a profile (REV-02): summary, then the full list.
 *
 * Guest-readable, because the API's review reads are public — this is the
 * evidence the guest first-interface exists to show off (ACC-01), and a profile
 * whose reviews demand an account is not a profile that drives sign-up.
 *
 * The summary and the list are two queries rather than one: the summary is an
 * aggregate over every visible review, and deriving it from the loaded page
 * would quietly turn "4.8 across 120 reviews" into "4.8 across the 20 we
 * happened to fetch".
 */
export function ProfileReviews({ subjectId }: { subjectId: string }) {
  const t = useTranslations('Reviews');
  const [reachedEnd, setReachedEnd] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: summaryData, loading: summaryLoading } = useQuery<ReviewSummaryQueryResult>(
    REVIEW_SUMMARY_QUERY,
    { variables: { subjectId }, fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
  );

  const { data, loading, error, fetchMore } = useQuery<ReviewsQueryResult>(REVIEWS_QUERY, {
    variables: { subjectId, limit: PAGE_SIZE, offset: 0 },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });

  const reviews = data?.reviews ?? [];
  const summary = summaryData?.reviewSummary;

  async function loadMore() {
    setLoadingMore(true);
    try {
      const result = await fetchMore({
        variables: { subjectId, limit: PAGE_SIZE, offset: reviews.length },
      });
      // A short page is the end of the list. Tracking it explicitly stops the
      // button from offering another round trip that can only come back empty.
      if ((result.data?.reviews?.length ?? 0) < PAGE_SIZE) setReachedEnd(true);
    } finally {
      setLoadingMore(false);
    }
  }

  if (summaryLoading && !summaryData) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton className="h-28 w-full rounded-card" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {summary && <ReviewSummaryPanel summary={summary} />}

      {error && reviews.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
          {t('listError')}
        </p>
      ) : loading && reviews.length === 0 ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-28 w-full rounded-card" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-14 text-center">
          <MessageSquareQuote aria-hidden className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t('listEmpty')}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t('listEmptyBody')}</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </ul>

          {!reachedEnd && summary && reviews.length < summary.total && (
            <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? t('loadingMore') : t('loadMore')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
