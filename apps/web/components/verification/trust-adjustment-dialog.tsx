'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { FormError } from '@/components/form-error';
import { ApiError } from '@/lib/api-error';
import { adjustTrustScore, TRUST_ADJUSTMENT_MAX_MAGNITUDE } from '@/lib/admin';

const REASON_MIN_LENGTH = 10;

/**
 * An exceptional Trust Score adjustment (ADM-04): a fraud penalty or a
 * Field-Verified bonus for a Founding Professional, applied as an explicit
 * TrustEvent rather than an edit to the number itself.
 *
 * Lives on the verification board rather than as a general admin tool, because
 * that is where "exceptional" actually arises in practice — a reviewer looking
 * at one person's documents finds either a fraud pattern the approve/reject
 * buttons don't cover, or a field-verified Founding Professional who deserves
 * more than the point model's standard field-verification credit.
 *
 * `admin:trust_adjust` is its own permission, held only by ADMIN — a caller
 * whose active role is AGENT should never see this control, since the server
 * would refuse it. That is checked by the parent, not here: this component
 * trusts it is only ever mounted for an admin.
 */
export function TrustAdjustmentDialog({
  subjectId,
  subjectName,
  onAdjusted,
}: {
  subjectId: string;
  subjectName: string | null;
  onAdjusted: () => void;
}) {
  const t = useTranslations('ReviewBoard');
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | string | null>(null);

  const parsedDelta = Number.parseInt(delta, 10);
  const deltaValid =
    delta.trim() !== '' &&
    Number.isInteger(parsedDelta) &&
    parsedDelta !== 0 &&
    Math.abs(parsedDelta) <= TRUST_ADJUSTMENT_MAX_MAGNITUDE;
  const reasonValid = reason.trim().length >= REASON_MIN_LENGTH;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!deltaValid || !reasonValid) return;

    setBusy(true);
    setError(null);
    try {
      await adjustTrustScore(subjectId, parsedDelta, reason.trim());
      toast({ title: t('adjustmentApplied', { delta: parsedDelta }) });
      setOpen(false);
      setDelta('');
      setReason('');
      onAdjusted();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : t('actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setDelta('');
          setReason('');
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Scale aria-hidden className="size-3.5" />
          {t('adjustTrustScore')}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('adjustDialogTitle')}</DialogTitle>
          <DialogDescription>
            {subjectName
              ? t('adjustDialogSubtitleNamed', { name: subjectName })
              : t('adjustDialogSubtitle')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="flex items-start gap-2 rounded-input bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t('adjustWarning')}
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adjust-delta">{t('deltaLabel')}</Label>
            <Input
              id="adjust-delta"
              type="number"
              inputMode="numeric"
              value={delta}
              disabled={busy}
              placeholder={t('deltaPlaceholder')}
              onChange={(event) => setDelta(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t('deltaHint', { max: TRUST_ADJUSTMENT_MAX_MAGNITUDE })}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adjust-reason">{t('adjustReasonLabel')}</Label>
            <textarea
              id="adjust-reason"
              value={reason}
              maxLength={1000}
              rows={3}
              disabled={busy}
              placeholder={t('adjustReasonPlaceholder')}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-input border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <p className="text-xs text-muted-foreground">{t('adjustReasonHint')}</p>
          </div>

          {error && <FormError error={error} />}

          <DialogFooter>
            <Button type="submit" variant="danger" disabled={busy || !deltaValid || !reasonValid}>
              {busy && <Loader2 aria-hidden className="animate-spin" />}
              {busy ? t('applying') : t('applyAdjustment')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
