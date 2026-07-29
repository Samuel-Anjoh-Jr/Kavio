'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/use-toast';
import { useIntentReplay, useRequireAuth } from '@/components/auth/require-auth';
import { QuoteComposer } from '@/components/quotes/quote-composer';
import { ApiError } from '@/lib/api-error';
import type { JobStatus } from '@/lib/jobs';
import {
  MY_APPLICATIONS_QUERY,
  MY_JOB_INVITATIONS_QUERY,
  type JobApplicationStatus,
  type MyApplicationsQueryResult,
  type MyJobInvitationsQueryResult,
} from '@/lib/graphql/jobs';
import { MY_QUOTES_QUERY, type MyQuotesQueryResult } from '@/lib/graphql/quotes';
import { restPost } from '@/lib/rest-api';

const QUOTABLE_STATUSES: readonly JobStatus[] = ['OPEN', 'QUOTED'];

const APPLICATION_TONE: Record<JobApplicationStatus, StatusTone> = {
  SUBMITTED: 'neutral',
  UNDER_REVIEW: 'primary',
  SHORTLISTED: 'accent',
  NOT_SELECTED: 'danger',
  HIRED: 'success',
  WITHDRAWN: 'neutral',
};

const WITHDRAWABLE: readonly JobApplicationStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED'];

/**
 * A worker's ways into a job that isn't theirs yet (JOB-03, JOB-04, QTE-01):
 * respond to an invitation, apply with a message, or send a priced quote
 * outright — the API gates none of the three behind the others, so neither
 * does this.
 *
 * Renders for a guest too (ACC-01): Apply is a gated action (ACC-02) that
 * bounces to login and resumes here; the invitation banner and the quote
 * composer need a real identity, so they render only once one exists.
 */
export function JobWorkerActions({ jobId, jobStatus }: { jobId: string; jobStatus: JobStatus }) {
  const t = useTranslations('JobDetail');
  const { toast } = useToast();
  const requireAuth = useRequireAuth();
  const { status: authStatus } = useSession();
  const authenticated = authStatus === 'authenticated';

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyMessage, setApplyMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: appData, refetch: refetchApps } = useQuery<MyApplicationsQueryResult>(
    MY_APPLICATIONS_QUERY,
    { skip: !authenticated, fetchPolicy: 'cache-and-network' },
  );
  const { data: invData, refetch: refetchInv } = useQuery<MyJobInvitationsQueryResult>(
    MY_JOB_INVITATIONS_QUERY,
    { skip: !authenticated, fetchPolicy: 'cache-and-network' },
  );
  const { data: quotesData, refetch: refetchQuotes } = useQuery<MyQuotesQueryResult>(
    MY_QUOTES_QUERY,
    { skip: !authenticated, fetchPolicy: 'cache-and-network' },
  );

  const myApplication = appData?.myApplications.find((a) => a.jobId === jobId) ?? null;
  const myInvitation = invData?.myJobInvitations.find((i) => i.jobId === jobId) ?? null;
  const alreadyQuoted = [
    ...(quotesData?.myQuotes.sent ?? []),
    ...(quotesData?.myQuotes.drafts ?? []),
  ].some((q) => q.jobId === jobId);

  const quotable = authenticated && QUOTABLE_STATUSES.includes(jobStatus) && !alreadyQuoted;

  useIntentReplay('apply_job', (intent) => {
    if (intent.payload?.jobId === jobId) setApplyOpen(true);
  });

  async function respondToInvitation(accept: boolean) {
    if (!myInvitation) return;
    setBusy(true);
    try {
      await restPost(`jobs/invitations/${myInvitation.id}/${accept ? 'accept' : 'decline'}`);
      await refetchInv();
      toast({ title: accept ? t('invitationAccepted') : t('invitationDeclined') });
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : t('actionFailed'),
        variant: 'danger',
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitApplication() {
    const message = applyMessage.trim();
    if (message.length < 10) return;
    setBusy(true);
    try {
      await restPost(`jobs/${jobId}/applications`, { message });
      setApplyOpen(false);
      setApplyMessage('');
      await refetchApps();
      toast({ title: t('applicationSent') });
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : t('actionFailed'),
        variant: 'danger',
      });
    } finally {
      setBusy(false);
    }
  }

  async function withdrawApplication() {
    if (!myApplication) return;
    setBusy(true);
    try {
      await restPost(`jobs/applications/${myApplication.id}/withdraw`);
      await refetchApps();
      toast({ title: t('applicationWithdrawn') });
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : t('actionFailed'),
        variant: 'danger',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {myInvitation?.status === 'PENDING' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary/30 bg-primary/10 p-4">
          <div>
            <p className="font-medium text-foreground">{t('invitationHeading')}</p>
            <p className="text-sm text-muted-foreground">{t('invitationBody')}</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void respondToInvitation(false)}
              disabled={busy}
            >
              {t('decline')}
            </Button>
            <Button size="sm" onClick={() => void respondToInvitation(true)} disabled={busy}>
              {t('accept')}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {quotable && (
          <QuoteComposer
            mode="create"
            jobId={jobId}
            onSaved={() => {
              void refetchQuotes();
              toast({ title: t('quoteSent') });
            }}
            trigger={
              <Button>
                <Receipt aria-hidden />
                {t('sendQuote')}
              </Button>
            }
          />
        )}

        {!myApplication && jobStatus === 'OPEN' && (
          <>
            <Button
              variant="outline"
              onClick={() =>
                requireAuth('apply_job', () => setApplyOpen(true), { payload: { jobId } })
              }
            >
              {t('apply')}
            </Button>
            <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t('applyTitle')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <textarea
                    rows={4}
                    value={applyMessage}
                    onChange={(e) => setApplyMessage(e.target.value)}
                    maxLength={2000}
                    placeholder={t('applyMessagePlaceholder')}
                    className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-surface-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button
                    onClick={() => void submitApplication()}
                    disabled={busy || applyMessage.trim().length < 10}
                  >
                    {t('submitApplication')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        {myApplication && (
          <div className="flex items-center gap-2">
            <StatusBadge
              tone={APPLICATION_TONE[myApplication.status]}
              label={t(`applicationStatus.${myApplication.status}`)}
            />
            {WITHDRAWABLE.includes(myApplication.status) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void withdrawApplication()}
                disabled={busy}
              >
                {t('withdraw')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
