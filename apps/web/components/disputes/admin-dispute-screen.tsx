'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FormBanner } from '@/components/auth/form-banner';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/lib/api-error';
import { formatDateTime } from '@/lib/datetime';
import {
  DISPUTE_ACTION_VARIANT,
  DISPUTE_RESOLUTION_TONE,
  DISPUTE_RESOLUTIONS,
  DISPUTE_STATUS_TONE,
  isEscrowFrozen,
  type DisputeResolution,
} from '@/lib/disputes';
import { DISPUTE_QUERY, type DisputeQueryResult } from '@/lib/graphql/disputes';
import { ESCROW_QUERY, type EscrowQueryResult } from '@/lib/graphql/payments';
import { ME_QUERY, type MeQueryResult } from '@/lib/graphql/documents';
import { restPost } from '@/lib/rest-api';
import { DisputeThread, FrozenBanner } from './dispute-thread';

/**
 * The admin dispute-resolution workspace (ADM-05).
 *
 * The admin sees the same case file the parties do — reason, thread, evidence,
 * and the frozen amount from escrow — and can add a message (to request info)
 * before deciding. The resolution bar is the part only an admin gets: four
 * actions that drive the escrow machine server-side (release / refund / request
 * info / close), each audit-logged and each notifying both parties. The API's
 * `admin:dispute_resolve` guard is the real control; this screen is its face.
 */
export function AdminDisputeScreen({ disputeId }: { disputeId: string }) {
  const t = useTranslations('Disputes');
  const locale = useLocale();

  const { data, loading, error, refetch } = useQuery<DisputeQueryResult>(DISPUTE_QUERY, {
    variables: { id: disputeId },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });
  const { data: meData } = useQuery<MeQueryResult>(ME_QUERY);

  const dispute = data?.dispute;

  const { data: escrowData } = useQuery<EscrowQueryResult>(ESCROW_QUERY, {
    variables: { bookingId: dispute?.bookingId ?? '' },
    skip: !dispute?.bookingId,
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const viewerId = meData?.me?.id ?? null;

  if (loading && !dispute) return <DisputeSkeleton />;

  if (!dispute) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {error ? t('admin.loadError') : t('notFound')}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const frozen = isEscrowFrozen(dispute.status);
  const resolved = dispute.status === 'RESOLVED';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/app/admin/disputes" className="text-sm text-primary hover:underline">
          {t('admin.backToQueue')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge
            tone={DISPUTE_STATUS_TONE[dispute.status]}
            label={t(`status.${dispute.status}`)}
          />
          {dispute.resolution && (
            <StatusBadge
              tone={DISPUTE_RESOLUTION_TONE[dispute.resolution]}
              label={t(`resolution.${dispute.resolution}`)}
            />
          )}
        </div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {t('admin.title')}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <Link href={`/app/jobs/${dispute.jobId}`} className="text-primary hover:underline">
            {t('viewJob')}
          </Link>
          <span className="font-numeric text-xs">
            {t('openedOn', { date: formatDateTime(dispute.createdAt, locale) ?? '' })}
          </span>
        </div>
      </div>

      <FrozenBanner frozen={frozen} heldAmount={escrowData?.escrow?.amount ?? null} />

      {resolved && (
        <div className="rounded-card border border-success/25 bg-success/10 p-4">
          <p className="font-medium text-foreground">{t('resolvedHeading')}</p>
          {dispute.resolutionNote && (
            <p className="text-sm text-muted-foreground">{dispute.resolutionNote}</p>
          )}
        </div>
      )}

      <DisputeThread
        dispute={dispute}
        viewerId={viewerId}
        canPost={!resolved}
        onPosted={() => void refetch()}
      />

      {!resolved && <ResolutionPanel disputeId={disputeId} onResolved={() => void refetch()} />}
    </div>
  );
}

function ResolutionPanel({ disputeId, onResolved }: { disputeId: string; onResolved: () => void }) {
  const t = useTranslations('Disputes');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('admin.resolveHeading')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t('admin.resolveHint')}</p>
        <div className="flex flex-wrap gap-2">
          {DISPUTE_RESOLUTIONS.map((resolution) => (
            <ResolveDialog
              key={resolution}
              disputeId={disputeId}
              resolution={resolution}
              onResolved={onResolved}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ResolveDialog({
  disputeId,
  resolution,
  onResolved,
}: {
  disputeId: string;
  resolution: DisputeResolution;
  onResolved: () => void;
}) {
  const t = useTranslations('Disputes');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await restPost(`disputes/${disputeId}/resolve`, {
        resolution,
        note: note.trim() || undefined,
      });
      setOpen(false);
      toast({ title: t(`admin.resolved.${resolution}`) });
      onResolved();
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: t('admin.resolveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={DISPUTE_ACTION_VARIANT[resolution]} size="sm">
          {t(`action.${resolution}`)}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`action.${resolution}`)}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error && <FormBanner tone="error" message={error.message} requestId={error.requestId} />}
          <p className="text-sm text-muted-foreground">{t(`actionEffect.${resolution}`)}</p>
          <div className="flex flex-col gap-2">
            <label htmlFor="resolve-note" className="text-sm font-medium text-foreground">
              {t('admin.noteLabel')}
            </label>
            <textarea
              id="resolve-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder={t('admin.notePlaceholder')}
              className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-surface-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Button
            variant={DISPUTE_ACTION_VARIANT[resolution]}
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {t('admin.confirmResolve')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DisputeSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-20 w-full rounded-card" />
      <Skeleton className="h-48 w-full rounded-card" />
      <Skeleton className="h-32 w-full rounded-card" />
    </div>
  );
}
