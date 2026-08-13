'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { RemoteImage } from '@/components/ui/remote-image';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { TierBadge } from '@/components/trust/tier-badge';
import { formatDate } from '@/lib/datetime';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { initials } from '@/lib/discovery';
import { restPost } from '@/lib/rest-api';
import {
  FEATURED_LISTING_REQUESTS_QUERY,
  type FeaturedListingRequestsResult,
  type FeaturedQueueItem,
} from '@/lib/graphql/featured';

const REASON_MIN = 10;
const REASON_MAX = 500;
const NOTE_MAX = 500;

/**
 * The admin review queue for sponsored ranking placement requests.
 *
 * Oldest-first, one decision per item: approve with a commission percentage
 * (converted to basis points before it leaves the browser, so no admin does
 * bps arithmetic in their head) or reject with a reason the requester will
 * actually see. Either action retires the item from PENDING, so a successful
 * approve/reject just makes the row disappear on refetch.
 */
export function FeaturedReviewQueue() {
  const t = useTranslations('FeaturedReviewQueue');
  const locale = useLocale();

  const { data, loading, error, refetch } = useQuery<FeaturedListingRequestsResult>(
    FEATURED_LISTING_REQUESTS_QUERY,
    { fetchPolicy: 'cache-and-network', notifyOnNetworkStatusChange: true },
  );

  const items = data?.featuredListingRequests ?? [];

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full rounded-card" />
        <Skeleton className="h-28 w-full rounded-card" />
        <Skeleton className="h-28 w-full rounded-card" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted-foreground">
        {t('loadError')}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-14 text-center">
        <Sparkles aria-hidden className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">{t('empty')}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <QueueRow key={item.id} item={item} locale={locale} onChanged={() => void refetch()} />
      ))}
    </ul>
  );
}

function QueueRow({
  item,
  locale,
  onChanged,
}: {
  item: FeaturedQueueItem;
  locale: string;
  onChanged: () => void;
}) {
  const t = useTranslations('FeaturedReviewQueue');
  const tRoles = useTranslations('Roles');
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  return (
    <li className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {item.avatar ? (
            <RemoteImage
              src={item.avatar}
              alt=""
              className="size-12 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-muted font-heading text-sm font-semibold text-muted-foreground"
            >
              {initials(item.name)}
            </span>
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-foreground">
                {item.name ?? t('unnamed')}
              </span>
              <TierBadge tier={item.tier} size="sm" />
              {item.activeRole && (
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {tRoles.has(`names.${item.activeRole}`)
                    ? tRoles(`names.${item.activeRole}`)
                    : item.activeRole}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('stats', { trustScore: item.trustScore, completedJobs: item.completedJobs })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('requestedOn', { date: formatDate(item.requestedAt, locale) ?? '' })}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
            <X aria-hidden />
            {t('reject')}
          </Button>
          <Button size="sm" onClick={() => setApproveOpen(true)}>
            <Check aria-hidden />
            {t('approve')}
          </Button>
        </div>
      </div>

      <ApproveDialog
        item={item}
        open={approveOpen}
        onOpenChange={setApproveOpen}
        onApproved={onChanged}
      />
      <RejectDialog
        item={item}
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onRejected={onChanged}
      />
    </li>
  );
}

function ApproveDialog({
  item,
  open,
  onOpenChange,
  onApproved,
}: {
  item: FeaturedQueueItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproved: () => void;
}) {
  const t = useTranslations('FeaturedReviewQueue');
  const translateError = useAuthErrorMessage();
  const { toast } = useToast();

  const [percent, setPercent] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const percentValue = Number(percent);
  const percentValid =
    percent.trim() !== '' &&
    Number.isFinite(percentValue) &&
    percentValue >= 0 &&
    percentValue <= 100;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!percentValid) {
      setError(t('commissionInvalid'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await restPost(`featured/${item.userId}/approve`, {
        // Basis points, 0-10000. Rounded so a typed "5.5" cannot drift to a
        // fractional bps value the server would reject.
        extraCommissionBps: Math.round(percentValue * 100),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onOpenChange(false);
      setPercent('');
      setNote('');
      onApproved();
      toast({ title: t('approvedToast', { name: item.name ?? t('unnamed') }) });
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('approveTitle', { name: item.name ?? t('unnamed') })}</DialogTitle>
          <DialogDescription>{t('approveSubtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`approve-percent-${item.id}`}>{t('commissionLabel')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id={`approve-percent-${item.id}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.1"
                value={percent}
                required
                disabled={submitting}
                onChange={(event) => setPercent(event.target.value)}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('commissionHint')}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`approve-note-${item.id}`}>{t('internalNoteLabel')}</Label>
            <Input
              id={`approve-note-${item.id}`}
              value={note}
              maxLength={NOTE_MAX}
              placeholder={t('internalNotePlaceholder')}
              disabled={submitting}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting || !percentValid}>
              {submitting ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Check aria-hidden />
              )}
              {t('confirmApprove')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  item,
  open,
  onOpenChange,
  onRejected,
}: {
  item: FeaturedQueueItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRejected: () => void;
}) {
  const t = useTranslations('FeaturedReviewQueue');
  const translateError = useAuthErrorMessage();
  const { toast } = useToast();

  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonTrimmed = reason.trim();
  const reasonValid = reasonTrimmed.length >= REASON_MIN && reasonTrimmed.length <= REASON_MAX;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reasonValid) {
      setError(t('reasonInvalid', { min: REASON_MIN }));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await restPost(`featured/${item.userId}/reject`, {
        reason: reasonTrimmed,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onOpenChange(false);
      setReason('');
      setNote('');
      onRejected();
      toast({ title: t('rejectedToast', { name: item.name ?? t('unnamed') }) });
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('rejectTitle', { name: item.name ?? t('unnamed') })}</DialogTitle>
          <DialogDescription>{t('rejectSubtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`reject-reason-${item.id}`}>{t('reasonLabel')}</Label>
            <textarea
              id={`reject-reason-${item.id}`}
              rows={3}
              value={reason}
              minLength={REASON_MIN}
              maxLength={REASON_MAX}
              placeholder={t('reasonPlaceholder')}
              disabled={submitting}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-surface-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">{t('reasonHint')}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`reject-note-${item.id}`}>{t('internalNoteLabel')}</Label>
            <Input
              id={`reject-note-${item.id}`}
              value={note}
              maxLength={NOTE_MAX}
              placeholder={t('internalNotePlaceholder')}
              disabled={submitting}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" variant="outline" disabled={submitting || !reasonValid}>
              {submitting ? <Loader2 aria-hidden className="animate-spin" /> : <X aria-hidden />}
              {t('confirmReject')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
