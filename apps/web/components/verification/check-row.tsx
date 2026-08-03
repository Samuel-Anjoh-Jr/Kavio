'use client';

import { useTranslations } from 'next-intl';
import { Check, Clock, MessageCircleQuestion, RotateCcw, ShieldAlert, Circle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  latestAttempt,
  stepState,
  type JourneyStep,
  type StepState,
  type VerificationRecord,
} from '@/lib/verification';
import { cn } from '@/lib/utils';

/**
 * One step of the verification journey (TRU-06, TRU-07).
 *
 * The rejected state is the one that matters most here. A refused ID is shown
 * with the localized, non-judgemental line the API selected (`rejectionKey`) and
 * a retry button right next to it — never a bare "REJECTED". TRU-07 exists
 * because the natural way to build this screen produces something that reads
 * like an accusation, and a worker who feels accused does not re-upload.
 */

const STATE_ICON: Record<StepState, LucideIcon> = {
  VERIFIED: Check,
  PENDING: Clock,
  REJECTED: RotateCcw,
  INFO_REQUESTED: MessageCircleQuestion,
  NOT_STARTED: Circle,
};

const STATE_STYLE: Record<StepState, string> = {
  VERIFIED: 'bg-success/15 text-success',
  PENDING: 'bg-accent/15 text-accent',
  REJECTED: 'bg-warning/15 text-warning',
  INFO_REQUESTED: 'bg-warning/15 text-warning',
  NOT_STARTED: 'bg-muted text-muted-foreground',
};

export function CheckRow({
  step,
  records,
  onStart,
  busy,
  error,
}: {
  step: JourneyStep;
  records: readonly VerificationRecord[];
  /** Opens the upload flow for this check, or requests a field visit. */
  onStart?: (step: JourneyStep) => void;
  /** True while this step's own request is in flight (field-visit request only). */
  busy?: boolean;
  /** Inline feedback for this step's own request, already localized. */
  error?: string | null;
}) {
  const t = useTranslations('Verification');
  const tScreen = useTranslations('VerificationScreen');

  const record = latestAttempt(records, step.checkType);
  const state = stepState(record);
  const Icon = STATE_ICON[state];

  // Confirmed forgery is the one refusal that cannot be retried (TRU-08).
  const canRetry = state === 'REJECTED' && (record?.retryable ?? true);
  const suspended = state === 'REJECTED' && record?.retryable === false;

  return (
    <li className="flex items-start gap-3 border-b border-border py-4 last:border-b-0">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
          STATE_STYLE[state],
        )}
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-medium text-foreground">{t(`check.${step.checkType}`)}</h3>

          {state === 'VERIFIED' && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              {t('status.VERIFIED')}
            </span>
          )}
          {state === 'PENDING' && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              {t('status.PENDING')}
            </span>
          )}
          {!step.selfServe && !step.requestable && state === 'NOT_STARTED' && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {tScreen('byInvitation')}
            </span>
          )}
          {record && record.attempt > 1 && (
            <span className="text-xs text-muted-foreground">
              {tScreen('attempt', { attempt: record.attempt })}
            </span>
          )}
        </div>

        {/* TRU-07: the friendly retry line, localized from the API's coded reason. */}
        {state === 'REJECTED' && record?.rejectionKey && (
          <p
            className={cn(
              'mt-2 flex items-start gap-2 rounded-input p-3 text-sm',
              suspended ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-foreground',
            )}
          >
            {suspended && <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />}
            {/* Keys arrive namespaced as "Verification.rejection.*"; this
                component is already scoped to Verification. */}
            {t(record.rejectionKey.replace(/^Verification\./, ''))}
          </p>
        )}

        {state === 'INFO_REQUESTED' && record?.infoRequest && (
          <div className="mt-2 rounded-input bg-warning/10 p-3">
            <p className="text-sm font-medium text-foreground">{t('infoRequested')}</p>
            {/* Written by a reviewer for this person, so it is shown verbatim. */}
            <p className="mt-1 text-sm text-muted-foreground">{record.infoRequest}</p>
          </div>
        )}

        {state === 'PENDING' && (
          <p className="mt-1 text-sm text-muted-foreground">{t('pending')}</p>
        )}

        {state === 'NOT_STARTED' && (step.selfServe || step.requestable) && (
          <p className="mt-1 text-sm text-muted-foreground">{tScreen(`hint.${step.checkType}`)}</p>
        )}

        {onStart && step.selfServe && (state === 'NOT_STARTED' || canRetry) && (
          <Button
            variant={canRetry ? 'primary' : 'outline'}
            size="sm"
            className="mt-3"
            onClick={() => onStart(step)}
          >
            {canRetry ? t('retry') : tScreen('start')}
          </Button>
        )}

        {onStart && step.requestable && state === 'NOT_STARTED' && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={busy}
            onClick={() => onStart(step)}
          >
            {busy ? tScreen('requestingVisit') : tScreen('requestVisit')}
          </Button>
        )}

        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
