'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Lock, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RemoteImage } from '@/components/ui/remote-image';
import { useToast } from '@/components/ui/use-toast';
import { AssetUploader } from '@/components/uploads/asset-uploader';
import { ApiError } from '@/lib/api-error';
import { formatXaf } from '@/lib/discovery';
import { formatDateTime } from '@/lib/datetime';
import type { DisputeDetail } from '@/lib/graphql/disputes';
import { restPost, type UploadResult } from '@/lib/rest-api';
import { cn } from '@/lib/utils';

/**
 * The shared dispute record — reason, the message thread with evidence
 * attachments, and a composer — reused by both the parties' view (PAY-03) and
 * the admin resolution workspace (ADM-05). Evidence is not a separate entity:
 * it rides on messages, so the thread IS the case file.
 */

/** The frozen-escrow banner. The freeze is the whole point of the dispute view. */
export function FrozenBanner({
  frozen,
  heldAmount,
}: {
  frozen: boolean;
  heldAmount: number | null;
}) {
  const t = useTranslations('Disputes');
  const locale = useLocale();
  if (!frozen) return null;

  return (
    <div className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning/10 p-4">
      <Lock aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
      <div>
        <p className="font-medium text-foreground">{t('frozenHeading')}</p>
        <p className="text-sm text-muted-foreground">
          {heldAmount != null
            ? t('frozenBodyAmount', { amount: formatXaf(heldAmount, locale) ?? '' })
            : t('frozenBody')}
        </p>
      </div>
    </div>
  );
}

export function DisputeThread({
  dispute,
  viewerId,
  canPost,
  onPosted,
}: {
  dispute: DisputeDetail;
  viewerId: string | null;
  /** Whether the viewer may add to the thread (either party or the admin, while open). */
  canPost: boolean;
  onPosted: () => void;
}) {
  const t = useTranslations('Disputes');
  const locale = useLocale();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('reasonHeading')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-surface-foreground">{dispute.reason}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('messagesHeading')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {dispute.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noMessages')}</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {dispute.messages.map((message) => {
                const own = viewerId != null && message.authorId === viewerId;
                return (
                  <li
                    key={message.id}
                    className={cn('flex flex-col gap-1', own ? 'items-end' : 'items-start')}
                  >
                    {message.body && (
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
                    )}
                    {message.attachments.length > 0 && (
                      <ul className="flex flex-wrap gap-2">
                        {message.attachments.map((attachment) =>
                          attachment.url ? (
                            <li key={attachment.id}>
                              <a href={attachment.url} target="_blank" rel="noreferrer">
                                <RemoteImage
                                  src={attachment.url}
                                  alt={t('evidenceAlt')}
                                  className="size-24 rounded-image border border-border object-cover"
                                />
                              </a>
                            </li>
                          ) : null,
                        )}
                      </ul>
                    )}
                    <span className="px-1 text-xs text-muted-foreground">
                      {own ? t('you') : t('participant')} ·{' '}
                      {formatDateTime(message.createdAt, locale)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {canPost && <MessageComposer disputeId={dispute.id} onSent={onPosted} />}
        </CardContent>
      </Card>
    </>
  );
}

/**
 * Posts a message, optionally with evidence attachments in the same call — the
 * server folds evidence into messages (disputeMessageSchema: body OR evidence).
 */
function MessageComposer({ disputeId, onSent }: { disputeId: string; onSent: () => void }) {
  const t = useTranslations('Disputes');
  const { toast } = useToast();
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<UploadResult[]>([]);
  const [sending, setSending] = useState(false);

  const canSend = body.trim().length > 0 || attachments.length > 0;

  async function send() {
    if (!canSend) return;
    setSending(true);
    try {
      await restPost(`disputes/${disputeId}/messages`, {
        body: body.trim() || undefined,
        evidenceAssetIds: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
      });
      setBody('');
      setAttachments([]);
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
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="relative size-16 overflow-hidden rounded-image border border-border bg-muted"
            >
              {attachment.url && (
                <RemoteImage src={attachment.url} alt="" className="size-full object-cover" />
              )}
              <button
                type="button"
                aria-label={t('removeEvidence')}
                onClick={() => setAttachments((c) => c.filter((a) => a.id !== attachment.id))}
                className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 text-foreground hover:bg-background"
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
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
        <Button size="icon" onClick={() => void send()} disabled={sending || !canSend}>
          {sending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
          <span className="sr-only">{t('send')}</span>
        </Button>
      </div>
      <AssetUploader
        kind="DISPUTE_EVIDENCE"
        label={t('addEvidence')}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onUploaded={(result) => setAttachments((c) => [...c, result])}
      />
    </div>
  );
}
