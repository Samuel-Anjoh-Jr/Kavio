'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FormBanner } from '@/components/auth/form-banner';
import { useRequireAuth } from '@/components/auth/require-auth';
import { ApiError } from '@/lib/api-error';
import {
  createReport,
  REASONS_BY_TARGET,
  type ReportReason,
  type ReportTargetType,
} from '@/lib/reports';

/**
 * The one report control, reused everywhere a user can see something (ADM-08):
 * profiles, jobs, portfolio photos, reviews, messages, conversations.
 *
 * Consolidating it into one component is what makes "report anything" a real
 * guarantee rather than a scattering of half-built menus — every surface that
 * mounts this gets the same reason list scoped to the target, the same login
 * gate, and the same honest success/error feedback.
 *
 * Reporting is a gated action (ACC-02): a guest who taps it is sent to login and
 * returned here, because a report has to be attributable to be actionable.
 */
export function ReportDialog({
  targetType,
  targetId,
  reportedUserId,
  trigger,
}: {
  targetType: ReportTargetType;
  targetId: string;
  /** Passed only for targets with no derivable owner (a conversation). */
  reportedUserId?: string;
  trigger: ReactNode;
}) {
  const t = useTranslations('Report');
  const requireAuth = useRequireAuth();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasons = REASONS_BY_TARGET[targetType];

  const submit = async () => {
    if (!reason) {
      setError(t('chooseReason'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createReport({
        targetType,
        targetId,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
        ...(reportedUserId ? { reportedUserId } : {}),
      });
      setDone(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setReason(null);
    setDetails('');
    setError(null);
    setDone(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Gate the OPEN, not the submit: a guest never even sees the form, they
        // go straight to login and resume here (ACC-02).
        if (next && !requireAuth('report_content')) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
              <ShieldCheck aria-hidden className="size-6" />
            </span>
            <DialogHeader>
              <DialogTitle>{t('thanksTitle')}</DialogTitle>
              <DialogDescription>{t('thanksBody')}</DialogDescription>
            </DialogHeader>
            <Button onClick={() => setOpen(false)}>{t('close')}</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('title')}</DialogTitle>
              <DialogDescription>{t('subtitle')}</DialogDescription>
            </DialogHeader>

            {error && <FormBanner tone="error" message={error} />}

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">
                {t('reasonLabel')}
              </legend>
              {reasons.map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-3 rounded-input border border-input px-3 py-2 text-sm transition-colors hover:bg-muted has-checked:border-primary has-checked:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={value}
                    checked={reason === value}
                    onChange={() => setReason(value)}
                    className="text-primary"
                  />
                  <span className="text-foreground">{t(`reason.${value}`)}</span>
                </label>
              ))}
            </fieldset>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">{t('detailsLabel')}</span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder={t('detailsPlaceholder')}
                className="resize-none rounded-input border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
                {t('cancel')}
              </Button>
              <Button onClick={() => void submit()} disabled={submitting || !reason}>
                {submitting && <Loader2 aria-hidden className="animate-spin" />}
                {t('submit')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
