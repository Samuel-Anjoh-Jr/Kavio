'use client';

import { useState } from 'react';
import { OpenInMaps } from '@/components/discovery/open-in-maps';
import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  Loader2,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/use-toast';
import { useRequireAuth } from '@/components/auth/require-auth';
import { ReportDialog } from '@/components/moderation/report-dialog';
import { MilestoneStepper, type Milestone } from '@/components/transactions/milestone-stepper';
import { ApiError } from '@/lib/api-error';
import { formatXaf } from '@/lib/discovery';
import { formatDateTime } from '@/lib/datetime';
import { isJobException, JOB_MILESTONES, JOB_STATUS_TONE, jobMilestoneIndex } from '@/lib/jobs';
import { JOB_QUERY, type JobQueryResult } from '@/lib/graphql/jobs';
import { ME_QUERY, type MeQueryResult } from '@/lib/graphql/documents';
import { MY_BOOKINGS_QUERY, type MyBookingsQueryResult } from '@/lib/graphql/quotes';
import { restPost } from '@/lib/rest-api';

/**
 * The live Job-in-Progress screen (JOB-06, JOB-07).
 *
 * The heart of it is the status timeline: the money-backed ladder a booked job
 * climbs — Accepted → In Progress → Completed → Payment released — rendered as an
 * animated stepper next to the real event history with its timestamps.
 *
 * The completion handoff is the important interaction. When the poster confirms
 * a completed job, that single action releases the escrow and prompts a review —
 * the client confirming is what pays the worker, so it is deliberately explicit.
 *
 * The buttons below post to the BOOKING'S escrow endpoints
 * (`bookings/:id/accept-work` / `start` / `complete` / `confirm`), not the
 * job's own `jobs/:id/transition`. Only the booking endpoints move money —
 * `EscrowService#applyTransition` updates the EscrowHold, pays the worker out
 * at RELEASED, and drives the job's own status to match as a side effect
 * (`applySystemTransition`). Calling `jobs/:id/transition` directly would move
 * the job's displayed status without ever touching escrow, leaving the booking
 * stuck and the worker unpaid.
 *
 * Which actions show is decided by who the viewer is; whether they are ALLOWED
 * is decided by the server, which authorises every transition against the
 * lifecycle table. The client offers, the server rules.
 */
export function JobDetailScreen({ jobId }: { jobId: string }) {
  const t = useTranslations('JobDetail');
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const { status: authStatus } = useSession();
  const requireAuth = useRequireAuth();

  const [busy, setBusy] = useState(false);

  const { data, loading, error, refetch } = useQuery<JobQueryResult>(JOB_QUERY, {
    variables: { id: jobId },
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  });

  const { data: meData } = useQuery<MeQueryResult>(ME_QUERY, {
    skip: authStatus !== 'authenticated',
  });

  const { data: bookingsData, refetch: refetchBookings } = useQuery<MyBookingsQueryResult>(
    MY_BOOKINGS_QUERY,
    { skip: authStatus !== 'authenticated', fetchPolicy: 'cache-and-network' },
  );

  const job = data?.job;
  const viewerId = meData?.me?.id ?? null;
  const isPoster = Boolean(viewerId && job && viewerId === job.posterId);
  // The viewer is a plausible worker on this job when signed in and not the
  // poster; the server has the final say on whether the transition is theirs.
  const isPossibleWorker = authStatus === 'authenticated' && !isPoster;
  const booking = bookingsData?.myBookings.find((b) => b.jobId === jobId) ?? null;

  async function advance(calls: string[], successKey: string) {
    if (!booking) return;
    setBusy(true);
    try {
      for (const call of calls) {
        await restPost(`bookings/${booking.id}/${call}`);
      }
      await Promise.all([refetch(), refetchBookings()]);
      toast({ title: t(successKey) });
      if (calls.includes('confirm')) {
        // Confirming completion is what releases the money and opens the review.
        toast({ title: t('reviewPrompt') });
      }
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : t('actionFailed'),
        variant: 'danger',
      });
    } finally {
      setBusy(false);
    }
  }

  function contact() {
    // Messaging is Phase 5; the gate and intent are wired now so a guest bounces
    // and a signed-in user gets a truthful "coming soon" rather than a 404.
    requireAuth('contact_worker', () => toast({ title: t('messagingSoon') }), {
      returnTo: `/app/jobs/${jobId}`,
    });
  }

  if (loading && !job) return <JobDetailSkeleton />;

  if (error || !job) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">{error ? t('loadError') : t('notFound')}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const milestoneIndex = jobMilestoneIndex(job.status);
  const exception = isJobException(job.status);

  const steps: Milestone[] = JOB_MILESTONES.map((milestone) => {
    const event = job.timeline.find((e) => e.toStatus === milestone);
    return {
      key: milestone,
      label: t(`milestone.${milestone}`),
      caption: t(`milestoneCaption.${milestone}`),
      at: event ? (formatDateTime(event.createdAt, locale) ?? undefined) : undefined,
    };
  });

  const budget = formatBudgetRange(job.budgetMin, job.budgetMax, locale, t('budgetOpen'));
  const category = locale === 'fr' ? job.categoryNameFr : job.categoryNameEn;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={JOB_STATUS_TONE[job.status]} label={t(`status.${job.status}`)} />
          {category && <span className="text-sm text-muted-foreground">{category}</span>}
        </div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {job.title || t('untitled')}
        </h1>
        {(job.landmark || job.area || job.city) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin aria-hidden className="size-4" />
              {job.landmark || [job.area, job.city].filter(Boolean).join(', ')}
            </p>
            {/* Guests get this too: deciding whether a job is worth the trip is
                exactly the question a stranger has before signing up. */}
            <OpenInMaps area={job.area} city={job.city} landmark={job.landmark} />
          </div>
        )}
        <p className="font-numeric text-sm text-muted-foreground">{budget}</p>
      </div>

      {exception && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning/10 p-4"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-foreground">{t(`exceptionHeading.${job.status}`)}</p>
            <p className="text-sm text-muted-foreground">{t(`exceptionBody.${job.status}`)}</p>
          </div>
        </div>
      )}

      {/* QUOTED jobs have no accept/decline UI here — quotes are negotiated in
          the quotes inbox (QTE-02) — so without this the poster has no way to
          discover that quotes have arrived at all. */}
      {isPoster && job.status === 'QUOTED' && (
        <div className="flex items-center justify-between gap-3 rounded-card border border-primary/30 bg-primary/10 p-4">
          <div>
            <p className="font-medium text-foreground">{t('quotesReceivedHeading')}</p>
            <p className="text-sm text-muted-foreground">{t('quotesReceivedBody')}</p>
          </div>
          <Button size="sm" onClick={() => router.push('/app/quotes')}>
            {t('viewQuotes')}
          </Button>
        </div>
      )}

      {job.description && (
        <Card>
          <CardContent className="whitespace-pre-wrap py-5 text-sm text-surface-foreground">
            {job.description}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('timelineHeading')}</CardTitle>
        </CardHeader>
        <CardContent>
          {milestoneIndex < 0 && !exception ? (
            <p className="text-sm text-muted-foreground">{t('notStarted')}</p>
          ) : (
            <MilestoneStepper
              steps={steps}
              currentIndex={milestoneIndex}
              tone={job.status === 'RELEASED' ? 'success' : 'accent'}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={contact}>
          <MessageCircle aria-hidden />
          {t('contact')}
        </Button>

        {isPossibleWorker && job.status === 'ACCEPTED' && booking && (
          <Button
            onClick={() =>
              void advance(
                // A retry after a partial failure may already be past PAID
                // (accept-work succeeded, start didn't) — only replay the step
                // that's actually still needed.
                booking.status === 'PAID' ? ['accept-work', 'start'] : ['start'],
                'startedToast',
              )
            }
            disabled={busy}
          >
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {t('startJob')}
          </Button>
        )}

        {isPossibleWorker && job.status === 'IN_PROGRESS' && booking && (
          <Button onClick={() => void advance(['complete'], 'completedToast')} disabled={busy}>
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : <CheckCircle2 aria-hidden />}
            {t('markComplete')}
          </Button>
        )}

        {isPoster && job.status === 'COMPLETED' && booking && (
          <Button
            variant="success"
            onClick={() => void advance(['confirm'], 'releasedToast')}
            disabled={busy}
          >
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : <ShieldCheck aria-hidden />}
            {t('confirmRelease')}
          </Button>
        )}

        {job.status === 'RELEASED' && (
          <Button variant="outline" onClick={contact}>
            <Star aria-hidden />
            {t('leaveReview')}
          </Button>
        )}

        {/* Two different "something is wrong" paths, deliberately not merged.
            A DISPUTE is about money on a job you are party to and freezes the
            escrow; a REPORT is about the post itself (a scam listing, a fake
            job) and anyone who can see it may file one. Offering only the first
            would leave a passer-by with no way to flag a fraudulent post. */}
        {authStatus === 'authenticated' &&
          (job.status === 'IN_PROGRESS' || job.status === 'COMPLETED') && (
            <Button
              variant="ghost"
              className="text-danger hover:bg-danger/10"
              onClick={() => router.push(`/app/jobs/${jobId}/dispute`)}
            >
              <AlertTriangle aria-hidden />
              {t('reportProblem')}
            </Button>
          )}

        {!isPoster && (
          <ReportDialog
            targetType="JOB"
            targetId={jobId}
            reportedUserId={job.posterId}
            trigger={
              <Button variant="ghost" className="text-muted-foreground">
                <Flag aria-hidden />
                {t('reportListing')}
              </Button>
            }
          />
        )}
      </div>

      {job.status === 'COMPLETED' && isPoster && (
        <p className="text-xs text-muted-foreground">{t('releaseHint')}</p>
      )}

      {/* ── Event history ────────────────────────────────────────────────── */}
      {job.timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('historyHeading')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3">
              {[...job.timeline].reverse().map((event, index) => (
                <li
                  key={`${event.toStatus}-${index}`}
                  className="flex items-baseline gap-3 text-sm"
                >
                  <StatusBadge
                    size="sm"
                    tone={JOB_STATUS_TONE[event.toStatus]}
                    label={t(`status.${event.toStatus}`)}
                  />
                  <span className="text-muted-foreground">{event.note}</span>
                  <span className="ml-auto shrink-0 font-numeric text-xs text-muted-foreground">
                    {formatDateTime(event.createdAt, locale)}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function JobDetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-40 w-full rounded-card" />
      <Skeleton className="h-64 w-full rounded-card" />
    </div>
  );
}

function formatBudgetRange(
  min: number | null,
  max: number | null,
  locale: string,
  openLabel: string,
): string {
  const fmtMin = formatXaf(min, locale);
  const fmtMax = formatXaf(max, locale);
  if (fmtMin && fmtMax) return `${fmtMin} – ${fmtMax}`;
  if (fmtMin) return `${fmtMin}+`;
  if (fmtMax) return `≤ ${fmtMax}`;
  return openLabel;
}
