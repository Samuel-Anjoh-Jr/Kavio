'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, Lock, Wallet } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FormBanner } from '@/components/auth/form-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/lib/api-error';
import { formatXaf } from '@/lib/discovery';
import { formatDateTime } from '@/lib/datetime';
import {
  BOOKING_STATUS_TONE,
  ESCROW_MILESTONES,
  escrowMilestoneIndex,
  isEscrowException,
} from '@/lib/quotes';
import { MY_BOOKINGS_QUERY, type Booking, type MyBookingsQueryResult } from '@/lib/graphql/quotes';
import {
  DEFAULT_MOMO_METHOD_QUERY,
  type DefaultMomoMethod,
  type DefaultMomoMethodQueryResult,
} from '@/lib/graphql/payments';
import { restPost } from '@/lib/rest-api';
import { InlineAddMomoMethod } from './inline-add-method';
import { MilestoneStepper, type Milestone } from './milestone-stepper';

/**
 * The escrow timelines (PAY-02, §15.1): one animated stepper per booking, with
 * the "funds are secure" assurance and the fee shown transparently.
 *
 * This is the part of the wallet that runs on already-shipped data — `myBookings`
 * (PROMPT 60) carries the status ladder AND the fee split snapshotted at
 * acceptance — so a user can watch their money move through escrow before the
 * balance/transactions backend (PROMPTS 63-66) is even wired.
 */
export function EscrowTimelines() {
  const t = useTranslations('Transactions');
  const { data, loading, error, refetch } = useQuery<MyBookingsQueryResult>(MY_BOOKINGS_QUERY, {
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  });

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-72 w-full rounded-card" />
        <Skeleton className="h-72 w-full rounded-card" />
      </div>
    );
  }

  if (error && !data) {
    return <p className="text-sm text-muted-foreground">{t('escrowLoadError')}</p>;
  }

  const bookings = data?.myBookings ?? [];
  if (bookings.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">{t('noEscrow')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {bookings.map((booking) => (
        <EscrowCard key={booking.id} booking={booking} onPaid={() => void refetch()} />
      ))}
    </div>
  );
}

function EscrowCard({ booking, onPaid }: { booking: Booking; onPaid: () => void }) {
  const t = useTranslations('Transactions');
  const locale = useLocale();

  const currentIndex = escrowMilestoneIndex(booking.status);
  const exception = isEscrowException(booking.status);
  const released = booking.status === 'RELEASED';
  const funded = currentIndex >= 1 && !exception; // PAID or beyond

  const steps: Milestone[] = ESCROW_MILESTONES.map((milestone) => ({
    key: milestone,
    label: t(`escrowStep.${milestone}`),
    caption: t(`escrowStepCaption.${milestone}`),
  }));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">
          <Link href={`/app/jobs/${booking.jobId}`} className="hover:text-primary hover:underline">
            {booking.jobTitle || t('untitledJob')}
          </Link>
        </CardTitle>
        <StatusBadge
          tone={BOOKING_STATUS_TONE[booking.status]}
          label={t(`bookingStatus.${booking.status}`)}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {exception ? (
          <div className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning/10 p-4">
            <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-foreground">
                {t(`escrowException.${booking.status}`)}
              </p>
              {booking.status === 'DISPUTED' && (
                <p className="text-sm text-muted-foreground">{t('disputeFrozenHint')}</p>
              )}
            </div>
          </div>
        ) : (
          <MilestoneStepper
            steps={steps}
            currentIndex={currentIndex}
            tone={released ? 'success' : 'accent'}
          />
        )}

        {/* The fee, shown transparently (PAY-02) — snapshotted onto the booking. */}
        <dl className="divide-y divide-border rounded-card border border-border">
          <FeeRow label={t('agreedPrice')} value={formatXaf(booking.agreedPrice, locale)} />
          <FeeRow
            label={t('platformFee')}
            value={`− ${formatXaf(booking.platformFeeAmount, locale)}`}
            muted
          />
          <FeeRow
            label={t('workerReceives')}
            value={formatXaf(booking.workerPayoutAmount, locale)}
            strong
          />
        </dl>

        {funded && !released && (
          <div className="flex items-center gap-2 rounded-card border border-success/25 bg-success/10 px-3 py-2.5 text-sm text-success">
            <Lock aria-hidden className="size-4 shrink-0" />
            {t('fundsSecure')}
          </div>
        )}
        {released && (
          <p className="text-xs text-muted-foreground">
            {t('releasedOn', { date: formatDateTime(booking.createdAt, locale) ?? '' })}
          </p>
        )}

        {booking.status === 'PENDING_PAYMENT' && <PayNowDialog booking={booking} onPaid={onPaid} />}
      </CardContent>
    </Card>
  );
}

/**
 * The explicit "fund the escrow" action a PENDING_PAYMENT booking is waiting
 * on (PAY-01). Accepting a quote only creates the booking — the API
 * deliberately does not auto-charge (see EscrowInitiationListener), so
 * without this button a booking sat in "Awaiting payment" forever with no
 * way to actually pay.
 */
function PayNowDialog({ booking, onPaid }: { booking: Booking; onPaid: () => void }) {
  const t = useTranslations('Transactions');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  // Proactive, not reactive: check for a Mobile Money method before the charge
  // is attempted, rather than surfacing NO_PAYMENT_METHOD after the fact with
  // nowhere in this dialog to fix it.
  const { data: methodData, loading: methodLoading } = useQuery<DefaultMomoMethodQueryResult>(
    DEFAULT_MOMO_METHOD_QUERY,
    { skip: !open, fetchPolicy: 'cache-and-network' },
  );
  const defaultMethod = methodData?.paymentMethods.find(
    (m) => m.isDefault && (m.type === 'MTN_MOMO' || m.type === 'ORANGE_MONEY'),
  );
  const [addedMethod, setAddedMethod] = useState<DefaultMomoMethod | null>(null);
  const effectiveMethod = addedMethod ?? defaultMethod;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setAddedMethod(null);
      setError(null);
    }
  }

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      await restPost(`bookings/${booking.id}/pay`);
      setOpen(false);
      toast({ title: t('paymentRequested') });
      onPaid();
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: t('paymentFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Wallet aria-hidden />
          {t('payNow')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payNowTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error && <FormBanner tone="error" message={error.message} requestId={error.requestId} />}
          {effectiveMethod ? (
            <p className="text-sm text-muted-foreground">{t('payNowHint')}</p>
          ) : (
            !methodLoading && <InlineAddMomoMethod onAdded={setAddedMethod} />
          )}
          <Button onClick={() => void pay()} disabled={busy || !effectiveMethod}>
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Wallet aria-hidden />}
            {t('confirmPay')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FeeRow({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string | null;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          strong
            ? 'font-numeric font-semibold text-foreground'
            : muted
              ? 'font-numeric text-muted-foreground'
              : 'font-numeric text-foreground'
        }
      >
        {value}
      </span>
    </div>
  );
}
