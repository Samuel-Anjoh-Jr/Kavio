'use client';

import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { Lock, MessageCircle, Phone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BOOKING_CONTACT_QUERY, type BookingContactQueryResult } from '@/lib/graphql/quotes';

/**
 * Call / WhatsApp the other party on a booking.
 *
 * The number appears only once escrow is funded: before that the card says
 * why it is hidden, so contact stays inside Kavio (messages) where the trust
 * record lives. The hint tells the client WHEN calling helps — the worker
 * already got a phone-call style alert, a call is the nudge if they are slow.
 */
export function BookingContactCard({ bookingId }: { bookingId: string }) {
  const t = useTranslations('JobDetail.contactCard');
  const { data, loading, error } = useQuery<BookingContactQueryResult>(BOOKING_CONTACT_QUERY, {
    variables: { bookingId },
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return <Skeleton className="h-28 w-full rounded-card" />;
  }
  if (error && !data) {
    return (
      <p role="alert" className="text-sm text-danger">
        {t('error')}
      </p>
    );
  }
  const contact = data?.bookingContact;
  if (!contact) return null;

  if (!contact.available || !contact.phone) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {contact.reason === 'CLOSED' ? t('closed') : t('lockedUntilFunded')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const isWorker = contact.role === 'WORKER';
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {isWorker ? t('yourWorker') : t('yourClient')}
          </p>
          <p className="font-heading text-lg font-semibold">{contact.name ?? '—'}</p>
          <p className="font-numeric text-sm tabular-nums text-muted-foreground">{contact.phone}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="primary">
            <a href={`tel:${contact.phone}`}>
              <Phone aria-hidden />
              {t('call')}
            </a>
          </Button>
          {contact.whatsappUrl ? (
            <Button asChild variant="outline">
              <a href={contact.whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden />
                {t('whatsapp')}
              </a>
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {isWorker ? t('hintClient') : t('hintWorker')}
        </p>
      </CardContent>
    </Card>
  );
}
