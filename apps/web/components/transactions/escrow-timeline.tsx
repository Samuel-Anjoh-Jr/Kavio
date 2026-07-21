'use client';

import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Lock } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatXaf } from '@/lib/discovery';
import { formatDateTime } from '@/lib/datetime';
import {
  BOOKING_STATUS_TONE,
  ESCROW_MILESTONES,
  escrowMilestoneIndex,
  isEscrowException,
} from '@/lib/quotes';
import { MY_BOOKINGS_QUERY, type Booking, type MyBookingsQueryResult } from '@/lib/graphql/quotes';
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
  const { data, loading, error } = useQuery<MyBookingsQueryResult>(MY_BOOKINGS_QUERY, {
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
        <EscrowCard key={booking.id} booking={booking} />
      ))}
    </div>
  );
}

function EscrowCard({ booking }: { booking: Booking }) {
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
                <Link
                  href={`/app/jobs/${booking.jobId}/dispute`}
                  className="text-sm text-primary hover:underline"
                >
                  {t('viewDispute')}
                </Link>
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
      </CardContent>
    </Card>
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
