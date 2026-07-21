'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Lock, Send, ShieldAlert } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RemoteImage } from '@/components/ui/remote-image';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/use-toast';
import { AssetUploader } from '@/components/uploads/asset-uploader';
import { ApiError } from '@/lib/api-error';
import { formatXaf } from '@/lib/discovery';
import { formatDateTime } from '@/lib/datetime';
import { DISPUTE_STATUS_TONE, DISPUTE_RESOLUTION_TONE, isEscrowFrozen } from '@/lib/disputes';
import { DISPUTE_QUERY, type DisputeQueryResult } from '@/lib/graphql/disputes';
import { ME_QUERY, type MeQueryResult } from '@/lib/graphql/documents';
import { restPost, type UploadResult } from '@/lib/rest-api';
import { cn } from '@/lib/utils';

/**
 * The parties' dispute view (PAY-03).
 *
 * The frozen escrow is the thing this screen exists to make VISIBLE: opening a
 * dispute freezes the associated hold until an admin resolves it (PROMPT 68), so
 * a locked banner with the held amount sits at the top and the assurance is
 * repeated — neither side's money moves while this is open, and both sides can
 * see that plainly. Below it: the timeline, the message thread and evidence
 * upload, so the parties can make their case.
 */
export function DisputeDetailScreen({ disputeId }: { disputeId: string }) {
  const t = useTranslations('Disputes');
  const locale = useLocale();
  const { toast } = useToast();
  const { status: authStatus } = useSession();

  const { data, loading, error, refetch } = useQuery<DisputeQueryResult>(DISPUTE_QUERY, {
    variables: { id: disputeId },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });
  const { data: meData } = useQuery<MeQueryResult>(ME_QUERY, {
    skip: authStatus !== 'authenticated',
  });

  const dispute = data?.dispute;
  const viewerId = meData?.me?.id ?? null;

  if (loading && !dispute) return <DisputeSkeleton />;

  if (!dispute) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">{error ? t('pending') : t('notFound')}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const frozen = dispute.escrowFrozen || isEscrowFrozen(dispute.status);

  async function addEvidence(result: UploadResult, caption?: string) {
    try {
      await restPost(`disputes/${disputeId}/evidence`, { assetId: result.id, caption });
      toast({ title: t('evidenceAdded') });
      await refetch();
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : t('actionFailed'),
        variant: 'danger',
      });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
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
          {dispute.jobTitle || t('title')}
        </h1>
        <Link href={`/app/jobs/${dispute.jobId}`} className="text-sm text-primary hover:underline">
          {t('viewJob')}
        </Link>
      </div>

      {/* The whole point: the freeze, made visible. */}
      {frozen && (
        <div className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning/10 p-4">
          <Lock aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-foreground">{t('frozenHeading')}</p>
            <p className="text-sm text-muted-foreground">
              {dispute.amountInEscrow != null
                ? t('frozenBodyAmount', { amount: formatXaf(dispute.amountInEscrow, locale) ?? '' })
                : t('frozenBody')}
            </p>
          </div>
        </div>
      )}

      {dispute.status === 'RESOLVED' && dispute.resolutionNote && (
        <div className="rounded-card border border-success/25 bg-success/10 p-4">
          <p className="font-medium text-foreground">{t('resolvedHeading')}</p>
          <p className="text-sm text-muted-foreground">{dispute.resolutionNote}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('reasonHeading')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-surface-foreground">{dispute.reason}</CardContent>
      </Card>

      {/* Timeline */}
      {dispute.timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('timelineHeading')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3">
              {dispute.timeline.map((event) => (
                <li key={event.id} className="flex items-baseline gap-3 text-sm">
                  <ShieldAlert aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-foreground">
                    {t.has(`event.${event.type}`) ? t(`event.${event.type}`) : event.type}
                  </span>
                  {event.note && <span className="text-muted-foreground">{event.note}</span>}
                  <span className="ml-auto shrink-0 font-numeric text-xs text-muted-foreground">
                    {formatDateTime(event.createdAt, locale)}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Evidence */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('evidenceHeading')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {dispute.evidence.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {dispute.evidence.map((item) => (
                <li
                  key={item.id}
                  className="overflow-hidden rounded-image border border-border bg-muted"
                >
                  {item.url && item.mimeType?.startsWith('image/') ? (
                    <RemoteImage
                      src={item.url}
                      alt={item.caption ?? ''}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <a
                      href={item.url ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="flex aspect-square items-center justify-center p-2 text-center text-xs text-muted-foreground"
                    >
                      {item.caption || t('viewFile')}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('noEvidence')}</p>
          )}

          {dispute.status !== 'RESOLVED' && authStatus === 'authenticated' && (
            <AssetUploader
              kind="DISPUTE_EVIDENCE"
              label={t('addEvidence')}
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onUploaded={(result) => void addEvidence(result)}
            />
          )}
        </CardContent>
      </Card>

      {/* Message thread */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('messagesHeading')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {dispute.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noMessages')}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {dispute.messages.map((message) => {
                const own = viewerId != null && message.authorId === viewerId;
                return (
                  <li
                    key={message.id}
                    className={cn('flex flex-col gap-1', own ? 'items-end' : 'items-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-card px-4 py-2.5 text-sm',
                        own
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-border bg-surface text-surface-foreground',
                      )}
                    >
                      {message.body}
                    </div>
                    <span className="px-1 text-xs text-muted-foreground">
                      {message.authorName ?? t('participant')} ·{' '}
                      {formatDateTime(message.createdAt, locale)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {dispute.status !== 'RESOLVED' && authStatus === 'authenticated' && (
            <MessageComposer disputeId={disputeId} onSent={() => void refetch()} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MessageComposer({ disputeId, onSent }: { disputeId: string; onSent: () => void }) {
  const t = useTranslations('Disputes');
  const { toast } = useToast();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await restPost(`disputes/${disputeId}/messages`, { body: trimmed });
      setBody('');
      onSent();
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : t('actionFailed'),
        variant: 'danger',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-end gap-2">
      <textarea
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        placeholder={t('messagePlaceholder')}
        aria-label={t('messagePlaceholder')}
        className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-surface-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button size="icon" onClick={() => void send()} disabled={sending || !body.trim()}>
        {sending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
        <span className="sr-only">{t('send')}</span>
      </Button>
    </div>
  );
}

function DisputeSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-20 w-full rounded-card" />
      <Skeleton className="h-48 w-full rounded-card" />
    </div>
  );
}
