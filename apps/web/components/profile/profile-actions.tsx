'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Flag, MessageSquare, Pencil, Receipt, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Link } from '@/i18n/navigation';
import { useRequireAuth } from '@/components/auth/require-auth';
import { ReportDialog } from '@/components/moderation/report-dialog';
import { recordRecentWorker } from '@/lib/discovery';

/**
 * Profile actions (PRO-04): Message, Request a Quote / Book, Share, Report.
 *
 * The access model in one component. A guest can READ this entire profile
 * (ACC-01) — that is the point of the guest first-interface — but every action
 * here changes state, so each one captures the intent, bounces to auth, and
 * RESUMES afterwards (ACC-02). The exception is Share, which changes nothing and
 * is the one thing a guest can do that helps us.
 *
 * Messaging and quoting land in Phases 4-5. Rather than hiding the buttons
 * until then, the gate runs for real and the destination says plainly that the
 * feature is coming — a disabled button teaches nothing about what the platform
 * will do, and this screen's job is to make the platform's potential obvious.
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
  const { toast } = useToast();
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
          requireAuth('request_quote', () => toast({ title: t('quoteComingSoon') }), {
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
          requireAuth('contact_worker', () => toast({ title: t('messagingComingSoon') }), {
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
    </div>
  );
}
