'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ExternalLink, Loader2, UserRound } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { RemoteImage } from '@/components/ui/remote-image';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormBanner } from '@/components/auth/form-banner';
import { useToast } from '@/components/ui/use-toast';
import { formatDateTime } from '@/lib/datetime';
import { ApiError } from '@/lib/api-error';
import {
  actionsFor,
  MODERATION_ACTION_TONE,
  REPORT_STATUS_TONE,
  reviewReportGroup,
  takeModerationAction,
  type ModerationActionType,
  type ReportTargetType,
} from '@/lib/reports';
import { REPORT_GROUP_QUERY, type ReportGroupQueryResult } from '@/lib/graphql/moderation';

/**
 * One moderation case, opened up (ADM-08): the reported item with a preview,
 * the accountable party and their history, every complaint about the item, and
 * the action panel.
 *
 * The action panel is where the "decide once per item" promise is kept: one
 * decision closes every open report in the group. The reason is shown to the
 * party, because a penalty someone cannot read is not due process — the copy
 * says so, and the field is required.
 */
export function ModerationCaseScreen({
  targetType,
  targetId,
}: {
  targetType: ReportTargetType;
  targetId: string;
}) {
  const t = useTranslations('Moderation');
  const tr = useTranslations('Report');
  const locale = useLocale();
  const router = useRouter();

  const { data, loading, refetch } = useQuery<ReportGroupQueryResult>(REPORT_GROUP_QUERY, {
    variables: { targetType, targetId },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const detail = data?.reportGroup;

  if (loading && !detail) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Skeleton className="h-80 w-full rounded-card" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t('notFound')}</p>
        <Button asChild variant="outline">
          <Link href="/app/admin/reports">{t('backToQueue')}</Link>
        </Button>
      </div>
    );
  }

  const { group, reports, history, removable } = detail;
  const party = group.reportedUser;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="w-fit gap-1.5">
        <Link href="/app/admin/reports">
          <ArrowLeft aria-hidden className="size-4" />
          {t('backToQueue')}
        </Link>
      </Button>

      {/* The reported item */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              size="sm"
              tone="neutral"
              label={t(`targetType.${group.target.targetType}`)}
            />
            <StatusBadge
              size="sm"
              tone={REPORT_STATUS_TONE[group.status]}
              label={t(`status.${group.status}`)}
            />
            {!group.target.exists && (
              <StatusBadge size="sm" tone="danger" label={t('itemRemoved')} />
            )}
          </div>

          {group.target.imageUrl && (
            <RemoteImage
              src={group.target.imageUrl}
              alt={group.target.label ?? ''}
              className="max-h-64 w-full rounded-card object-contain"
            />
          )}
          {group.target.label && (
            <p className="font-heading text-lg font-semibold text-foreground">
              {group.target.label}
            </p>
          )}
          {group.target.excerpt && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {group.target.excerpt}
            </p>
          )}
          {group.target.url && group.target.exists && (
            <a
              href={group.target.url.replace(/^\/[a-z]{2}(?=\/)/, '')}
              className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink aria-hidden className="size-4" />
              {t('viewItem')}
            </a>
          )}
        </CardContent>
      </Card>

      {/* The party + action panel */}
      {party && (
        <Card>
          <CardContent className="flex flex-col gap-4 py-5">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
                {party.avatar ? (
                  <RemoteImage src={party.avatar} alt="" className="size-full object-cover" />
                ) : (
                  <UserRound aria-hidden className="size-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{party.name}</p>
                <p className="text-xs text-muted-foreground">
                  {party.status}
                  {party.priorActionCount > 0 &&
                    ` · ${t('priorActions', { count: party.priorActionCount })}`}
                </p>
              </div>
            </div>

            <ActionPanel
              targetType={group.target.targetType}
              targetId={group.target.targetId}
              subjectUserId={party.id}
              removable={removable}
              status={group.status}
              onDone={() => {
                void refetch();
                router.push('/app/admin/reports');
              }}
              onReviewing={() => void refetch()}
            />
          </CardContent>
        </Card>
      )}

      {/* History */}
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-semibold text-foreground">
          {t('historyHeading')}
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noHistory')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((action) => (
              <li
                key={action.id}
                className="flex items-start gap-3 rounded-card border border-border bg-surface p-3"
              >
                <StatusBadge
                  size="sm"
                  tone={MODERATION_ACTION_TONE[action.action]}
                  label={t(`action.${action.action}`)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{action.reason}</p>
                  <p className="font-numeric text-xs text-muted-foreground">
                    {formatDateTime(action.createdAt, locale)}
                    {action.expiresAt && ` → ${formatDateTime(action.expiresAt, locale)}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The complaints */}
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-semibold text-foreground">
          {t('reportersHeading')} ({group.totalCount})
        </h2>
        <ul className="flex flex-col gap-2">
          {reports.map((report) => (
            <li key={report.id} className="rounded-card border border-border bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {tr(`reason.${report.reason}`)}
                </span>
                <span className="font-numeric text-xs text-muted-foreground">
                  {formatDateTime(report.createdAt, locale)}
                </span>
              </div>
              {report.details && (
                <p className="mt-1 text-sm text-muted-foreground">{report.details}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {t('reportedBy')}: {report.reporter?.name ?? t('anonymous')}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ActionPanel({
  targetType,
  targetId,
  subjectUserId,
  removable,
  status,
  onDone,
  onReviewing,
}: {
  targetType: ReportTargetType;
  targetId: string;
  subjectUserId: string;
  removable: boolean;
  status: string;
  onDone: () => void;
  onReviewing: () => void;
}) {
  const t = useTranslations('Moderation');
  const { toast } = useToast();
  const [action, setAction] = useState<ModerationActionType | null>(null);

  const pickUp = async () => {
    try {
      await reviewReportGroup({ targetType, targetId, status: 'REVIEWING' });
      onReviewing();
    } catch (error) {
      toast({
        variant: 'danger',
        title: t('actionFailed'),
        description: error instanceof ApiError ? error.message : undefined,
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status === 'OPEN' && (
          <Button variant="outline" size="sm" onClick={() => void pickUp()}>
            {t('pickUp')}
          </Button>
        )}
        {actionsFor(removable).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={value === 'BAN' || value === 'SUSPEND' ? 'danger' : 'outline'}
            onClick={() => setAction(value)}
          >
            {t(`action.${value}`)}
          </Button>
        ))}
      </div>

      {action && (
        <ActionDialog
          action={action}
          targetType={targetType}
          targetId={targetId}
          subjectUserId={subjectUserId}
          onClose={() => setAction(null)}
          onDone={onDone}
        />
      )}
    </div>
  );
}

function ActionDialog({
  action,
  targetType,
  targetId,
  subjectUserId,
  onClose,
  onDone,
}: {
  action: ModerationActionType;
  targetType: ReportTargetType;
  targetId: string;
  subjectUserId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('Moderation');
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [suspendDays, setSuspendDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 3) {
      setError(t('reasonRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await takeModerationAction({
        action,
        targetType,
        targetId,
        subjectUserId,
        reason: reason.trim(),
        ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
        ...(action === 'SUSPEND' ? { suspendDays } : {}),
      });
      toast({
        title: t('actioned'),
        description: t('reportsClosed', { count: result.reportsClosed }),
      });
      onClose();
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('actionFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('decideTitle', { action: t(`action.${action}`) })}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{t(`actionEffect.${action}`)}</p>

        {error && <FormBanner tone="error" message={error} />}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">{t('reasonLabel')}</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t('reasonPlaceholder')}
            className="resize-none rounded-input border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {action === 'SUSPEND' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{t('suspendDaysLabel')}</span>
            <input
              type="number"
              min={1}
              max={730}
              value={suspendDays}
              onChange={(event) => setSuspendDays(Number(event.target.value))}
              className="w-32 rounded-input border border-input bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">{t('internalNoteLabel')}</span>
          <textarea
            value={internalNote}
            onChange={(event) => setInternalNote(event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={t('internalNotePlaceholder')}
            className="resize-none rounded-input border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button
            variant={action === 'BAN' || action === 'SUSPEND' ? 'danger' : 'primary'}
            onClick={() => void submit()}
            disabled={submitting || reason.trim().length < 3}
          >
            {submitting && <Loader2 aria-hidden className="animate-spin" />}
            {t('confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
