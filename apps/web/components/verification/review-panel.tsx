'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowRight, Check, MessageCircleQuestion, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { FormError } from '@/components/form-error';
import { ApiError } from '@/lib/api-error';
import {
  advanceVerification,
  approveVerification,
  rejectVerification,
  requestMoreInfo,
} from '@/lib/verification-api';
import {
  canTransition,
  isSuspendingReason,
  PIPELINE_STAGES,
  REJECTION_REASONS,
  type VerificationRejectionReason,
  type VerificationStage,
} from '@/lib/verification';

type Mode = 'idle' | 'reject' | 'info';

/**
 * Approve / reject / request-more-info with reason capture (ADM-03, AGT-03).
 *
 * Rejecting requires a CODED reason, not free text. The code is what selects the
 * localized, non-judgemental retry line the worker sees (TRU-07) — a reviewer
 * typing "blurry, rejected" into a box would reach a Francophone worker as an
 * English fragment written by a stranger having a bad day. The optional note is
 * staff-facing and never rendered to the subject.
 *
 * CONFIRMED_FRAUDULENT is the one reason that permanently suspends an identity
 * (TRU-08), so it carries an explicit warning before the button will fire.
 */
export function ReviewPanel({
  recordId,
  stage,
  onDecided,
}: {
  recordId: string;
  /** The item's CURRENT stage — which of Approve/Reject/Ask-for-more/advance
   * are legal moves depends on it (mirrors STAGE_TRANSITIONS server-side). */
  stage: VerificationStage;
  /** Refetches the board — a decided item leaves the column it was in. */
  onDecided: () => void;
}) {
  const t = useTranslations('ReviewBoard');
  const tVerify = useTranslations('Verification');
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>('idle');
  const [reason, setReason] = useState<VerificationRejectionReason | ''>('');
  const [note, setNote] = useState('');
  const [infoRequest, setInfoRequest] = useState('');
  const [busy, setBusy] = useState(false);
  // Kept as the ApiError itself, not its message, so FormError can show the
  // requestId a reviewer would quote to support.
  const [error, setError] = useState<ApiError | string | null>(null);

  async function run(action: () => Promise<unknown>, successKey: string) {
    setBusy(true);
    setError(null);

    try {
      await action();
      toast({ title: t(successKey) });
      setMode('idle');
      setReason('');
      setNote('');
      setInfoRequest('');
      onDecided();
    } catch (caught) {
      // Inline, never silent (engineering standards). The requestId travels with
      // the ApiError so a reviewer can quote it.
      setError(caught instanceof ApiError ? caught : t('actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  const suspends = reason !== '' && isSuspendingReason(reason);
  const infoTooShort = infoRequest.trim().length < 10;

  // Approve and "ask for more" are only legal from specific stages
  // (PENDING_APPROVAL, and anything that can step back to SUBMITTED,
  // respectively) — mirrors the server's own STAGE_TRANSITIONS /
  // USE_DECISION_ENDPOINT rules, so a reviewer is never offered a button that
  // will 409. Reject is legal from every non-terminal stage, so it needs no
  // gating. Everything short of PENDING_APPROVAL instead gets one button per
  // legal forward move — APPROVED/REJECTED excluded, since those are the
  // dedicated decision actions below, not a plain stage advance.
  const canApprove = stage === 'PENDING_APPROVAL';
  const canRequestInfo = canTransition(stage, 'SUBMITTED');
  // The caller only ever renders this for a non-terminal item (QueueCard
  // hides it once `decided`), so `stage` is always SUBMITTED, UNDER_REVIEW,
  // FIELD_CHECK or PENDING_APPROVAL here.
  const currentIndex = PIPELINE_STAGES.indexOf(stage);
  const advanceTargets = PIPELINE_STAGES.filter(
    (target) =>
      target !== 'APPROVED' &&
      target !== 'REJECTED' &&
      PIPELINE_STAGES.indexOf(target) > currentIndex &&
      canTransition(stage, target),
  );

  return (
    <div className="mt-3 border-t border-border pt-3">
      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {advanceTargets.map((target) => (
            <Button
              key={target}
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => advanceVerification(recordId, target), 'advanced')}
            >
              <ArrowRight aria-hidden className="size-3.5" />
              {t('advanceTo', { stage: tVerify(`stage.${target}`) })}
            </Button>
          ))}
          {canApprove && (
            <Button
              variant="success"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => approveVerification(recordId), 'approved')}
            >
              <Check aria-hidden className="size-3.5" />
              {t('approve')}
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setMode('reject')}>
            <X aria-hidden className="size-3.5" />
            {t('reject')}
          </Button>
          {canRequestInfo && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMode('info')}>
              <MessageCircleQuestion aria-hidden className="size-3.5" />
              {t('requestInfo')}
            </Button>
          )}
        </div>
      )}

      {mode === 'reject' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`reason-${recordId}`}>{t('reasonLabel')}</Label>
            <Select value={reason} onValueChange={(value) => setReason(value as never)}>
              <SelectTrigger id={`reason-${recordId}`}>
                <SelectValue placeholder={t('reasonPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {REJECTION_REASONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`reason.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('reasonHint')}</p>
          </div>

          {suspends && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-input bg-danger/10 p-3 text-sm text-danger"
            >
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t('suspensionWarning')}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`note-${recordId}`}>{t('noteLabel')}</Label>
            <textarea
              id={`note-${recordId}`}
              value={note}
              maxLength={500}
              rows={2}
              onChange={(event) => setNote(event.target.value)}
              className="w-full rounded-input border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">{t('noteHint')}</p>
          </div>

          {error && <FormError error={error} />}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={busy || reason === ''}
              onClick={() =>
                void run(
                  () => rejectVerification(recordId, reason as VerificationRejectionReason, note),
                  'rejected',
                )
              }
            >
              {suspends ? t('confirmSuspend') : t('confirmReject')}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMode('idle')}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {mode === 'info' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`info-${recordId}`}>{t('infoLabel')}</Label>
            <textarea
              id={`info-${recordId}`}
              value={infoRequest}
              maxLength={500}
              rows={3}
              onChange={(event) => setInfoRequest(event.target.value)}
              className="w-full rounded-input border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {/* This one IS shown to the subject, so the server enforces a floor
                of 10 characters — "more info please" costs another round trip. */}
            <p className="text-xs text-muted-foreground">{t('infoHint')}</p>
          </div>

          {error && <FormError error={error} />}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || infoTooShort}
              onClick={() =>
                void run(() => requestMoreInfo(recordId, infoRequest.trim()), 'infoRequested')
              }
            >
              {t('sendRequest')}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMode('idle')}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
