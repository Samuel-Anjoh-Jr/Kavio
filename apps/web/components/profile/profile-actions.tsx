'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Flag, MessageSquare, Pencil, Receipt, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Link, useRouter } from '@/i18n/navigation';
import { useIntentReplay, useRequireAuth } from '@/components/auth/require-auth';
import { ReportDialog } from '@/components/moderation/report-dialog';
import { RequestQuoteDialog } from '@/components/jobs/request-quote-dialog';
import { ApiError } from '@/lib/api-error';
import { recordRecentWorker } from '@/lib/discovery';
import { startConversation } from '@/lib/messaging';

/**
 * Profile actions (PRO-04): Message, Request a Quote / Book, Share, Report.
 *
 * The access model in one component. A guest can READ this entire profile
 * (ACC-01) — that is the point of the guest first-interface — but every action
 * here changes state, so each one captures the intent, bounces to auth, and
 * RESUMES afterwards (ACC-02). The exception is Share, which changes nothing and
 * is the one thing a guest can do that helps us.
 *
 * Message opens a real conversation (MSG-01, job-less — `startConversation`
 * accepts no `jobId`). Request a Quote opens a DIRECT job for this worker and
 * invites them (JOB-01, JOB-03) — the same "client chose this counterparty"
 * engagement the posting gate exists to distinguish from the public board, so
 * it needs no verification either.
 */
/** Browser capability, fixed for the life of the page — nothing to subscribe to. */
const NO_SUBSCRIBE = () => () => {};

function hasShareSheet(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export function ProfileActions({
  workerUserId,
  workerName,
  avatar,
  headline,
  isOwner,
}: {
  workerUserId: string;
  workerName: string;
  avatar: string | null;
  headline: string | null;
  isOwner: boolean;
}) {
  const t = useTranslations('Profile');
  const requireAuth = useRequireAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  // navigator.share exists only on some browsers, and only over HTTPS. Read as
  // an external store so the server render (no share sheet) and the client's
  // first paint agree, without a state write in an effect.
  const canShare = useSyncExternalStore(NO_SUBSCRIBE, hasShareSheet, () => false);

  // Recently viewed is browsing history: it belongs to the device, and a guest
  // gets it without an account (DIS-10). Writing to an external store is exactly
  // what an effect is for.
  useEffect(() => {
    recordRecentWorker({ userId: workerUserId, name: workerName, avatar, headline });
  }, [workerUserId, workerName, avatar, headline]);

  async function contactWorker() {
    try {
      const { id } = await startConversation({ recipientId: workerUserId });
      router.push(`/app/messages/${id}`);
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : t('messageFailed'),
        variant: 'danger',
      });
    }
  }

  // A guest's tap bounces to auth and RESUMES here (ACC-02): Message needs no
  // typed content to replay, so it fires for real; Request a Quote needs a
  // description of the work, so the resume is just reopening the dialog for
  // the guest to finish what they started.
  useIntentReplay('contact_worker', (intent) => {
    if (intent.payload?.workerUserId === workerUserId) void contactWorker();
  });
  useIntentReplay('request_quote', (intent) => {
    if (intent.payload?.workerUserId === workerUserId) setQuoteDialogOpen(true);
  });

  async function share() {
    const url = window.location.href;

    try {
      if (canShare) {
        await navigator.share({ title: workerName, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ title: t('linkCopied') });
    } catch {
      // A cancelled share sheet throws. That is the user changing their mind,
      // not a failure worth telling them about.
    }
  }

  if (isOwner) {
    return (
      <div className="flex flex-wrap gap-3">
        {/* The dedicated profile-management screen arrives with PROMPT 48; until
            then the worker's own onboarding flow is where services, portfolio
            and availability are edited, so that is where this points. */}
        <Button asChild>
          <Link href="/app/onboarding/worker">
            <Pencil aria-hidden />
            {t('editProfile')}
          </Link>
        </Button>
        <Button variant="outline" onClick={() => void share()}>
          <Share2 aria-hidden />
          {t('share')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button
        onClick={() =>
          requireAuth('request_quote', () => setQuoteDialogOpen(true), {
            payload: { workerUserId },
          })
        }
      >
        <Receipt aria-hidden />
        {t('requestQuote')}
      </Button>

      <Button
        variant="outline"
        onClick={() =>
          requireAuth('contact_worker', () => void contactWorker(), {
            payload: { workerUserId },
          })
        }
      >
        <MessageSquare aria-hidden />
        {t('message')}
      </Button>

      <Button variant="ghost" onClick={() => void share()}>
        <Share2 aria-hidden />
        {t('share')}
      </Button>

      {/* Reporting is gated like any other write (the dialog calls requireAuth
          itself). An anonymous report channel would be abused to bury
          competitors, and the report is only actionable for staff if it is
          attached to somebody. */}
      <ReportDialog
        targetType="WORKER_PROFILE"
        targetId={workerUserId}
        reportedUserId={workerUserId}
        trigger={
          <Button variant="ghost">
            <Flag aria-hidden />
            {t('report')}
          </Button>
        }
      />

      <RequestQuoteDialog
        workerUserId={workerUserId}
        workerName={workerName}
        open={quoteDialogOpen}
        onOpenChange={setQuoteDialogOpen}
      />
    </div>
  );
}
