'use client';

import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Clock, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TierBadge } from '@/components/trust/tier-badge';
import { ReviewPanel } from './review-panel';
import { SecureDocumentViewer } from './secure-document-viewer';
import { TrustAdjustmentDialog } from './trust-adjustment-dialog';
import { claimVerification } from '@/lib/verification-api';
import { daysWaiting, isTerminalStage, STALE_AFTER_DAYS } from '@/lib/verification';
import type { VerificationQueueItem } from '@/lib/graphql/documents';
import { cn } from '@/lib/utils';

/**
 * One submission on the board (AGT-02, ADM-03).
 *
 * Dense on purpose: an agent works a queue, and every row of chrome is a row of
 * real items pushed off the screen. The subject's tier and score ride along
 * because "who is this" is the first thing a reviewer needs, and fetching it
 * per-card would be an N+1 against the very list being scrolled.
 */
export function QueueCard({
  item,
  onChanged,
}: {
  item: VerificationQueueItem;
  onChanged: () => void;
}) {
  const t = useTranslations('ReviewBoard');
  const tVerify = useTranslations('Verification');
  const { data: session } = useSession();

  const waiting = daysWaiting(item.submittedAt);
  const stale = waiting >= STALE_AFTER_DAYS && !isTerminalStage(item.stage);
  const decided = isTerminalStage(item.stage);
  // `admin:trust_adjust` is ADMIN-only — an agent reviewing this same board
  // must never see a control the server would 403. The UI check is a courtesy;
  // the API's permission guard is the actual enforcement (ADM-04).
  const isAdmin = session?.user?.activeRole === 'ADMIN';

  return (
    <article
      className={cn(
        'rounded-input border bg-surface p-3 text-sm',
        stale ? 'border-warning/40' : 'border-border',
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate font-medium text-foreground">
            {item.subjectName ?? t('unnamedSubject')}
          </h4>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {tVerify(`check.${item.checkType}`)}
          </p>
        </div>
        <span className="shrink-0 font-numeric text-xs text-muted-foreground tabular-nums">
          {item.subjectTrustScore}
        </span>
      </header>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <TierBadge tier={item.subjectTier} size="sm" />
        {item.attempt > 1 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t('attempt', { attempt: item.attempt })}
          </span>
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
            stale ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground',
          )}
        >
          <Clock aria-hidden className="size-3" />
          {waiting === 0 ? t('waitingToday') : t('waitingDays', { days: waiting })}
        </span>
        {item.assignedToId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
            <UserCheck aria-hidden className="size-3" />
            {t('claimed')}
          </span>
        )}
      </div>

      {/* Not scoped to `!decided`: an exceptional adjustment (a fraud finding, a
          Founding Professional bonus) is a fact about the SUBJECT's score, not a
          decision on this one submission, so it stays reachable even once the
          item itself has left the active queue. */}
      {isAdmin && (
        <div className="mt-2">
          <TrustAdjustmentDialog
            subjectId={item.subjectId}
            subjectName={item.subjectName}
            onAdjusted={onChanged}
          />
        </div>
      )}

      {item.documentIds.length > 0 && (
        <div className="mt-3">
          <SecureDocumentViewer documentIds={item.documentIds} subjectName={item.subjectName} />
        </div>
      )}

      {/* A decided item is history: no actions, because APPROVED and REJECTED
          are terminal stages the API will not move anything out of. */}
      {!decided && (
        <>
          {!item.assignedToId && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() => void claimVerification(item.id).then(onChanged)}
            >
              {t('claim')}
            </Button>
          )}

          <ReviewPanel recordId={item.id} stage={item.stage} onDecided={onChanged} />
        </>
      )}
    </article>
  );
}
