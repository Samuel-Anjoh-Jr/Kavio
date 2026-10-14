'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Check, CheckCheck, MapPin } from 'lucide-react';
import { RemoteImage } from '@/components/ui/remote-image';
import { formatTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/graphql/messaging';
import { JobCard, PaymentCard, QuoteCard } from './message-cards';
import { VoicePlayer } from './voice-player';

/**
 * One message bubble (MSG-01, MSG-02). The `kind` decides the body: text, an
 * image, a voice note with a waveform, a shared pin, or one of the QUOTE / JOB /
 * PAYMENT cards. A soft-deleted message renders as a neutral placeholder so the
 * thread still reads coherently after a moderator takes something down (MSG-03).
 */
export function MessageBubble({ message, own }: { message: Message; own: boolean }) {
  const locale = useLocale();

  return (
    <div className={cn('flex w-full', own ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex max-w-[85%] flex-col gap-1 sm:max-w-[70%]', own && 'items-end')}>
        <div
          className={cn(
            'overflow-hidden rounded-card px-3 py-2 text-sm',
            message.deleted
              ? 'border border-dashed border-border bg-transparent italic text-muted-foreground'
              : own
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground',
            // Cards and media want no text padding cramping them.
            !message.deleted &&
              (message.kind === 'QUOTE' ||
                message.kind === 'JOB' ||
                message.kind === 'PAYMENT' ||
                message.kind === 'IMAGE') &&
              'bg-transparent p-0',
          )}
        >
          <MessageBody message={message} />
        </div>

        <div
          className={cn(
            'flex items-center gap-1 px-1 text-[11px] text-muted-foreground',
            own && 'flex-row-reverse',
          )}
        >
          <span className="font-numeric tabular-nums">
            {formatTime(message.createdAt, locale) ?? ''}
          </span>
          {own && !message.deleted && <DeliveryTick status={message.status} />}
        </div>
      </div>
    </div>
  );
}

function MessageBody({ message }: { message: Message }) {
  const t = useTranslations('Messaging');

  if (message.deleted) {
    return <span>{t('messageDeleted')}</span>;
  }

  switch (message.kind) {
    case 'IMAGE':
      return message.mediaUrl ? (
        <RemoteImage
          src={message.mediaUrl}
          alt={message.body ?? t('cards.imageAlt')}
          className="max-h-72 w-full rounded-card object-cover"
        />
      ) : (
        <span className="text-muted-foreground">{t('cards.imageUnavailable')}</span>
      );

    case 'VOICE':
      return <VoicePlayer src={message.mediaUrl} />;

    case 'LOCATION':
      return <LocationCard latitude={message.latitude} longitude={message.longitude} />;

    case 'QUOTE':
      return message.refId ? <QuoteCard /> : null;

    case 'JOB':
      return message.refId ? <JobCard jobId={message.refId} /> : null;

    case 'PAYMENT':
      return message.refId ? <PaymentCard bookingId={message.refId} /> : null;

    default:
      return <span className="whitespace-pre-wrap break-words">{message.body}</span>;
  }
}

function LocationCard({
  latitude,
  longitude,
}: {
  latitude: number | null;
  longitude: number | null;
}) {
  const t = useTranslations('Messaging');

  if (latitude === null || longitude === null) {
    return <span className="text-muted-foreground">{t('cards.locationUnavailable')}</span>;
  }

  // A static, tokenised card rather than an embedded map: chat is not the place
  // to boot a Mapbox instance per message, and the link opens the real map.
  return (
    <a
      href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-card border border-border bg-surface p-3 text-foreground transition-colors hover:bg-muted"
    >
      <MapPin aria-hidden className="size-4 text-accent-ink" />
      <span className="text-sm">{t('cards.sharedLocation')}</span>
    </a>
  );
}

function DeliveryTick({ status }: { status: Message['status'] }) {
  const t = useTranslations('Messaging');

  if (status === 'READ') {
    return <CheckCheck aria-label={t('status.read')} className="size-3.5 text-accent-ink" />;
  }
  if (status === 'DELIVERED') {
    return <CheckCheck aria-label={t('status.delivered')} className="size-3.5" />;
  }
  return <Check aria-label={t('status.sent')} className="size-3.5" />;
}
