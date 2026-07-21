'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FormBanner } from '@/components/auth/form-banner';
import { ApiError } from '@/lib/api-error';
import { MY_BOOKINGS_QUERY, type MyBookingsQueryResult } from '@/lib/graphql/quotes';
import { restPost } from '@/lib/rest-api';

/**
 * Opening a dispute on a job (PAY-03). This is the entry point that FREEZES the
 * escrow (PROMPT 68): the moment a party opens one, the hold is locked until an
 * admin resolves it.
 *
 * A dispute hangs off the BOOKING, not the job, because that is where the money
 * is — so this resolves the job's booking first. A job with no booking has no
 * escrow to dispute, and the form says so instead of failing on submit. On
 * success the party lands on the dispute detail view, where the freeze and the
 * thread are visible.
 */
export function OpenDisputeForm({ jobId }: { jobId: string }) {
  const t = useTranslations('Disputes');
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const { data, loading } = useQuery<MyBookingsQueryResult>(MY_BOOKINGS_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  const booking = (data?.myBookings ?? []).find((b) => b.jobId === jobId) ?? null;

  if (loading && !data) {
    return <Skeleton className="h-64 w-full rounded-card" />;
  }

  if (!booking) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t('noBooking')}
        </CardContent>
      </Card>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      setError({ message: t('reasonTooShort') });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dispute = await restPost<{ id: string }>('disputes', {
        bookingId: booking!.id,
        message: trimmed,
      });
      router.push(`/app/disputes/${dispute.id}`);
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: t('openFailed') });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {error && <FormBanner tone="error" message={error.message} requestId={error.requestId} />}

      <div className="rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
        {t('openWarning')}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="dispute-reason" className="text-sm font-medium text-foreground">
          {t('reasonLabel')}
        </label>
        <textarea
          id="dispute-reason"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          placeholder={t('reasonPlaceholder')}
          className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-surface-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" variant="danger" disabled={busy}>
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
        {t('openDispute')}
      </Button>
    </form>
  );
}
