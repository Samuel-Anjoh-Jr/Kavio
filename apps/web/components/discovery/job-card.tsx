'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Briefcase, MapPin } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { RemoteImage } from '@/components/ui/remote-image';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { formatXaf } from '@/lib/discovery';
import { formatArea } from '@/lib/geo';
import type { JobBoardEntry } from '@/lib/graphql/jobs';
import type { JobUrgency } from '@/lib/jobs';
import { cn } from '@/lib/utils';

/**
 * The Job Card (JOB-04) — the teaser unit for the public job board, reused by
 * the guest explore page's "Recently posted jobs" rail and the full `/app/jobs`
 * board. Mirrors WorkerCard's information order: WHAT (title, category) →
 * WHERE → BUDGET → HOW SOON, because that is the order a worker scanning for
 * work actually decides in.
 */

const URGENCY_TONE: Record<JobUrgency, StatusTone> = {
  FLEXIBLE: 'neutral',
  WITHIN_WEEK: 'primary',
  WITHIN_48_HOURS: 'warning',
  EMERGENCY: 'danger',
};

export interface JobCardProps {
  job: JobBoardEntry;
  className?: string;
}

export function JobCard({ job, className }: JobCardProps) {
  const t = useTranslations('JobCard');
  const tUrgency = useTranslations('PostJob');
  const locale = useLocale();

  const categoryName = locale === 'fr' ? job.categoryNameFr : job.categoryNameEn;
  const location = formatArea({ area: job.area, city: job.city });
  const photo = job.photos[0]?.url ?? null;
  const jobHref = `/app/jobs/${job.id}`;

  const min = formatXaf(job.budgetMin, locale);
  const max = formatXaf(job.budgetMax, locale);
  let budget: string | null = null;
  if (min && max && job.budgetMin !== job.budgetMax) {
    budget = t('budgetRange', { min, max });
  } else if (min ?? max) {
    budget = `${t('budgetFrom')} ${min ?? max}`;
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {photo ? (
          <RemoteImage src={photo} alt="" className="size-14 shrink-0 rounded-image object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-image bg-muted text-muted-foreground"
          >
            <Briefcase aria-hidden className="size-6" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-heading text-base font-semibold text-foreground">
            <Link
              href={jobHref}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {job.title ?? t('unnamedJob')}
            </Link>
          </h3>
          {categoryName && <p className="truncate text-sm text-muted-foreground">{categoryName}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          tone={URGENCY_TONE[job.urgency]}
          label={tUrgency(`urgency.${job.urgency}`)}
          size="sm"
        />
        {location && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin aria-hidden className="size-3.5" />
            {location}
          </span>
        )}
      </div>

      <p className="font-numeric text-sm font-semibold text-foreground">
        {budget ?? t('budgetOnRequest')}
      </p>
    </div>
  );
}

export function JobCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-14 shrink-0 rounded-image" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-4 w-28" />
    </div>
  );
}
