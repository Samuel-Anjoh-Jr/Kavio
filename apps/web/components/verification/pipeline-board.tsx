'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@apollo/client/react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { QueueCard } from './queue-card';
import {
  VERIFICATION_PIPELINE_QUERY,
  VERIFICATION_QUEUE_QUERY,
  type VerificationPipelineQueryResult,
  type VerificationQueueQueryResult,
} from '@/lib/graphql/documents';
import { PIPELINE_STAGES, type VerificationStage } from '@/lib/verification';

/**
 * The agent/admin review board (AGT-02, ADM-03) — calm and dense per the TMDS
 * admin profile: no entrance animation, no hover lift, nothing that moves while
 * someone is reading an ID number.
 *
 * Client-side Apollo rather than RSC because the board must refetch the instant
 * a decision lands; a server-rendered board would need a full navigation to show
 * that the item just approved has left the column. Reads are still GraphQL and
 * writes are still REST, so the DUAL API RULE holds either way.
 *
 * Columns are queried independently. One busy SUBMITTED column would otherwise
 * force the whole board to paginate together, and a reviewer working
 * PENDING_APPROVAL does not care that intake is backed up.
 */
export function PipelineBoard() {
  const t = useTranslations('ReviewBoard');

  const { data: metrics, refetch: refetchMetrics } = useQuery<VerificationPipelineQueryResult>(
    VERIFICATION_PIPELINE_QUERY,
    { variables: { windowDays: 30 } },
  );

  const pipeline = metrics?.verificationPipeline;
  const countFor = (stage: VerificationStage) =>
    pipeline?.stages.find((entry) => entry.stage === stage)?.count ?? 0;

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            {t('heading')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{t('metricPending')}</dt>
            <dd className="font-numeric text-lg font-semibold text-foreground tabular-nums">
              {pipeline?.pending ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('metricAvgReview')}</dt>
            <dd className="font-numeric text-lg font-semibold text-foreground tabular-nums">
              {/* Null until something has been decided — "0 minutes" and
                  "nothing reviewed yet" are different facts. */}
              {pipeline?.averageReviewMinutes == null
                ? '—'
                : t('minutes', { minutes: Math.round(pipeline.averageReviewMinutes) })}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('metricApprovalRate')}</dt>
            <dd className="font-numeric text-lg font-semibold text-foreground tabular-nums">
              {pipeline?.approvalRate == null ? '—' : `${Math.round(pipeline.approvalRate * 100)}%`}
            </dd>
          </div>
        </dl>
      </header>

      {/* Horizontal scroll lives on the board, never on the page body. */}
      <div className="mt-6 overflow-x-auto pb-4">
        <div className="flex min-w-max gap-4">
          {PIPELINE_STAGES.map((stage) => (
            <StageColumn
              key={stage}
              stage={stage}
              count={countFor(stage)}
              onChanged={() => void refetchMetrics()}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  count,
  onChanged,
}: {
  stage: VerificationStage;
  count: number;
  onChanged: () => void;
}) {
  const t = useTranslations('ReviewBoard');
  const tVerify = useTranslations('Verification');

  const { data, loading, error, refetch } = useQuery<VerificationQueueQueryResult>(
    VERIFICATION_QUEUE_QUERY,
    {
      variables: { stage, limit: 25 },
      // A queue two agents are working is stale the moment it is fetched.
      fetchPolicy: 'cache-and-network',
    },
  );

  const handleChanged = useCallback(() => {
    void refetch();
    onChanged();
  }, [refetch, onChanged]);

  const items = data?.verificationQueue ?? [];

  return (
    <section aria-labelledby={`column-${stage}`} className="flex w-72 shrink-0 flex-col">
      <header className="flex items-baseline justify-between gap-2 border-b border-border pb-2">
        <h2 id={`column-${stage}`} className="text-sm font-semibold text-foreground">
          {tVerify(`stage.${stage}`)}
        </h2>
        <span className="font-numeric text-xs text-muted-foreground tabular-nums">{count}</span>
      </header>

      <div className="mt-3 flex flex-col gap-3">
        {loading && items.length === 0 && (
          <>
            <Skeleton className="h-32 w-full rounded-input" />
            <Skeleton className="h-32 w-full rounded-input" />
          </>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-input border border-danger/25 bg-danger/10 p-3 text-sm text-danger"
          >
            <p>{t('columnError')}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => void refetch()}>
              {t('retry')}
            </Button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="rounded-input border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {t('columnEmpty')}
          </p>
        )}

        {items.map((item) => (
          <QueueCard key={item.id} item={item} onChanged={handleChanged} />
        ))}
      </div>
    </section>
  );
}
