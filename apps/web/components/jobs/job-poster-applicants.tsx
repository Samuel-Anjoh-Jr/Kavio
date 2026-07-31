'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { RemoteImage } from '@/components/ui/remote-image';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/use-toast';
import { TierBadge } from '@/components/trust/tier-badge';
import { ApiError } from '@/lib/api-error';
import { initials } from '@/lib/discovery';
import {
  JOB_APPLICANTS_QUERY,
  JOB_INVITATIONS_QUERY,
  type JobApplicationStatus,
  type JobApplicantsQueryResult,
  type JobInvitationsQueryResult,
  type JobInvitationStatus,
} from '@/lib/graphql/jobs';
import { restPatch, restPost } from '@/lib/rest-api';
import { Link } from '@/i18n/navigation';

const APPLICATION_TONE: Record<JobApplicationStatus, StatusTone> = {
  SUBMITTED: 'neutral',
  UNDER_REVIEW: 'primary',
  SHORTLISTED: 'accent',
  NOT_SELECTED: 'danger',
  HIRED: 'success',
  WITHDRAWN: 'neutral',
};

const INVITATION_TONE: Record<JobInvitationStatus, StatusTone> = {
  PENDING: 'primary',
  ACCEPTED: 'success',
  DECLINED: 'danger',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
};

/**
 * Who has raised a hand for this job, on the poster's own view (JOB-03,
 * JOB-04): applicants who came looking, and the workers this poster invited
 * directly. Neither list gates the other, and neither gates a quote arriving —
 * this is context for the poster while they wait, not a queue they must clear.
 */
export function JobPosterApplicants({ jobId }: { jobId: string }) {
  const t = useTranslations('JobDetail');
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: appData, refetch: refetchApps } = useQuery<JobApplicantsQueryResult>(
    JOB_APPLICANTS_QUERY,
    { variables: { jobId }, fetchPolicy: 'cache-and-network' },
  );
  const { data: invData, refetch: refetchInv } = useQuery<JobInvitationsQueryResult>(
    JOB_INVITATIONS_QUERY,
    { variables: { jobId }, fetchPolicy: 'cache-and-network' },
  );

  const applicants = appData?.jobApplicants ?? [];
  const invitations = invData?.jobInvitations ?? [];

  if (applicants.length === 0 && invitations.length === 0) return null;

  async function setApplicationStatus(
    applicationId: string,
    status: 'SHORTLISTED' | 'NOT_SELECTED',
  ) {
    setBusyId(applicationId);
    try {
      await restPatch(`jobs/applications/${applicationId}`, { status });
      await refetchApps();
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : t('actionFailed'),
        variant: 'danger',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function cancelInvitation(invitationId: string) {
    setBusyId(invitationId);
    try {
      await restPost(`jobs/invitations/${invitationId}/cancel`);
      await refetchInv();
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : t('actionFailed'),
        variant: 'danger',
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {applicants.length > 0 && (
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {t('applicantsHeading', { count: applicants.length })}
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {applicants.map((application) => (
              <li
                key={application.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-border bg-surface p-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  {application.worker?.avatar ? (
                    <RemoteImage
                      src={application.worker.avatar}
                      alt=""
                      className="size-10 shrink-0 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold text-muted-foreground">
                      {initials(application.worker?.name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {application.worker ? (
                        <Link
                          href={`/app/workers/${application.worker.workerId}`}
                          className="truncate font-medium text-foreground hover:underline"
                        >
                          {application.worker.name ?? t('unnamedWorker')}
                        </Link>
                      ) : (
                        <span className="truncate font-medium text-foreground">
                          {t('unnamedWorker')}
                        </span>
                      )}
                      {application.worker && <TierBadge tier={application.worker.tier} size="sm" />}
                      <StatusBadge
                        tone={APPLICATION_TONE[application.status]}
                        label={t(`applicationStatus.${application.status}`)}
                      />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{application.message}</p>
                    {application.attachments.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {application.attachments.map((attachment, index) =>
                          attachment.url ? (
                            <li key={attachment.id}>
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
                              >
                                <FileText aria-hidden className="size-3.5" />
                                {t('applicantAttachment', { index: index + 1 })}
                              </a>
                            </li>
                          ) : null,
                        )}
                      </ul>
                    )}
                  </div>
                </div>

                {(application.status === 'SUBMITTED' || application.status === 'UNDER_REVIEW') && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === application.id}
                      onClick={() => void setApplicationStatus(application.id, 'NOT_SELECTED')}
                    >
                      {t('notSelected')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busyId === application.id}
                      onClick={() => void setApplicationStatus(application.id, 'SHORTLISTED')}
                    >
                      {t('shortlist')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {invitations.length > 0 && (
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {t('invitationsSentHeading', { count: invitations.length })}
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {invitation.worker?.avatar ? (
                    <RemoteImage
                      src={invitation.worker.avatar}
                      alt=""
                      className="size-10 shrink-0 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold text-muted-foreground">
                      {initials(invitation.worker?.name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    {invitation.worker ? (
                      <Link
                        href={`/app/workers/${invitation.worker.workerId}`}
                        className="truncate font-medium text-foreground hover:underline"
                      >
                        {invitation.worker.name ?? t('unnamedWorker')}
                      </Link>
                    ) : (
                      <span className="truncate font-medium text-foreground">
                        {t('unnamedWorker')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge
                    tone={INVITATION_TONE[invitation.status]}
                    label={t(`invitationStatus.${invitation.status}`)}
                  />
                  {invitation.status === 'PENDING' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === invitation.id}
                      onClick={() => void cancelInvitation(invitation.id)}
                    >
                      {t('cancelInvitation')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
