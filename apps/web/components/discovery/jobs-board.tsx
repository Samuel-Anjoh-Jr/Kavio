'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { JOBS_QUERY, type JobsQueryResult } from '@/lib/graphql/jobs';
import { JobCard, JobCardSkeleton } from './job-card';

const PAGE_SIZE = 12;

/**
 * The full public job board (JOB-04) behind `/app/jobs` — the "See all"
 * destination for the guest explore page's jobs teaser rail. Open to guests
 * (ACC-01); the `jobs` GraphQL query is `@Public()` on the resolver.
 */
export function JobsBoard() {
  const t = useTranslations('Jobs');
  const tSearch = useTranslations('Search');
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const { data, loading, previousData } = useQuery<JobsQueryResult>(JOBS_QUERY, {
    variables: { pageSize },
    notifyOnNetworkStatusChange: true,
  });

  const board = data?.jobs ?? previousData?.jobs;
  const jobs = board?.jobs ?? [];

  if (loading && jobs.length === 0) {
    return (
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <JobCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="mt-8 rounded-card border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>

      {board?.hasMore && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => setPageSize((current) => current + PAGE_SIZE)}
          >
            {loading && <Loader2 aria-hidden className="animate-spin" />}
            {tSearch('loadMore')}
          </Button>
        </div>
      )}
    </>
  );
}
