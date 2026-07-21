'use client';

import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDateTime } from '@/lib/datetime';
import { DISPUTE_STATUS_TONE, DISPUTE_RESOLUTION_TONE, isEscrowFrozen } from '@/lib/disputes';
import { DISPUTE_QUERY, type DisputeQueryResult } from '@/lib/graphql/disputes';
import { ESCROW_QUERY, type EscrowQueryResult } from '@/lib/graphql/payments';
import { ME_QUERY, type MeQueryResult } from '@/lib/graphql/documents';
import { DisputeThread, FrozenBanner } from './dispute-thread';

/**
 * The parties' dispute view (PAY-03).
 *
 * The freeze is what this screen exists to make visible: opening a dispute
 * freezes the booking's escrow until an admin resolves it (PROMPT 68), so a
 * locked banner with the exact held amount sits at the top. Beneath it is the
 * thread, where the parties state their case.
 *
 * Parties cannot resolve their own dispute — that is an admin action (ADM-05),
 * handled in the admin workspace. This view is where they make their case.
 */
export function DisputeDetailScreen({ disputeId }: { disputeId: string }) {
  const t = useTranslations('Disputes');
  const locale = useLocale();
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
          <p className="text-sm text-muted-foreground">{error ? t('pending') : t('notFound')}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const frozen = isEscrowFrozen(dispute.status);

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
          {t('title')}
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

      {dispute.status === 'RESOLVED' && (
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
        canPost={dispute.status !== 'RESOLVED' && authStatus === 'authenticated'}
        onPosted={() => void refetch()}
      />
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
