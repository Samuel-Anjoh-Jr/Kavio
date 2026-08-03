'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { animate } from 'animejs';
import { countUp, motionDuration } from '@/lib/motion';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { TierBadge } from '@/components/trust/tier-badge';
import { BenefitUnlocks } from './benefit-unlocks';
import { CheckRow } from './check-row';
import {
  journeyProgress,
  WORKER_JOURNEY,
  type VerificationCheckType,
  type JourneyStep,
  type Tier,
  type VerificationRecord,
} from '@/lib/verification';

/**
 * The worker verification screen as PROGRESS, not a checklist (TRU-05).
 *
 * Structure carries the requirement: the percentage and what it unlocks come
 * first, anything the worker must act on comes second, and the per-check detail
 * comes last. Read top-down it answers "how far am I, and what do I get" before
 * it ever asks for a document.
 */
export function VerificationJourney({
  records,
  tier,
  journey = WORKER_JOURNEY,
  onStart,
  busyCheckType,
  actionError,
}: {
  records: VerificationRecord[];
  tier: Tier;
  journey?: readonly JourneyStep[];
  onStart?: (step: JourneyStep) => void;
  /** The one step whose own request is in flight (field-visit request only). */
  busyCheckType?: VerificationCheckType | null;
  /** Inline feedback for `busyCheckType`'s step, already localized. */
  actionError?: string | null;
}) {
  const t = useTranslations('VerificationScreen');
  const barRef = useRef<HTMLDivElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const previousPercent = useRef(0);

  const progress = journeyProgress(records, journey);

  useEffect(() => {
    const bar = barRef.current;
    if (bar) {
      animate(bar, {
        // scaleX rather than width: transform-only keeps this off the layout path.
        scaleX: [previousPercent.current / 100, progress.percent / 100],
        duration: motionDuration(700),
        ease: 'outQuad',
      });
    }

    if (percentRef.current) {
      countUp(percentRef.current, {
        from: previousPercent.current,
        to: progress.percent,
        duration: 700,
        format: (value) => `${Math.round(value)}%`,
      });
    }

    previousPercent.current = progress.percent;
  }, [progress.percent]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {t('heading')}
        </h1>
        <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
      </header>

      <section
        aria-labelledby="progress-heading"
        className="mt-6 rounded-card border border-border bg-surface p-5 sm:p-6"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2
            id="progress-heading"
            className="font-heading text-base font-semibold text-foreground"
          >
            {t('progressHeading')}
          </h2>
          <span ref={percentRef} className="font-numeric text-3xl font-semibold text-primary">
            {progress.percent}%
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-labelledby="progress-heading"
          className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div ref={barRef} className="h-full origin-left rounded-full bg-primary" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span>{t('stepsDone', { done: progress.verified, total: progress.total })}</span>
          <TierBadge tier={tier} size="sm" />
        </div>
      </section>

      {/* Anything the worker must act on, surfaced above the detail so it is
          never buried under steps that are already done. */}
      {progress.actionable > 0 && (
        <p
          role="status"
          className="mt-4 rounded-card border border-warning/25 bg-warning/10 p-4 text-sm text-foreground"
        >
          {t('actionNeeded', { count: progress.actionable })}
        </p>
      )}

      {progress.actionable === 0 && progress.awaitingReview > 0 && (
        <p
          role="status"
          className="mt-4 rounded-card border border-accent/25 bg-accent/10 p-4 text-sm text-foreground"
        >
          {t('awaitingReview', { count: progress.awaitingReview })}
        </p>
      )}

      <div className="mt-6">
        <BenefitUnlocks tier={tier} />
      </div>

      <section
        aria-labelledby="steps-heading"
        className="mt-6 rounded-card border border-border bg-surface p-5 sm:p-6"
      >
        <h2 id="steps-heading" className="font-heading text-base font-semibold text-foreground">
          {t('stepsHeading')}
        </h2>

        <ul className="mt-2">
          {journey.map((step) => (
            <CheckRow
              key={step.checkType}
              step={step}
              records={records}
              onStart={onStart}
              busy={busyCheckType === step.checkType}
              error={busyCheckType === step.checkType ? actionError : null}
            />
          ))}
        </ul>
      </section>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Button asChild variant="link">
          <Link href="/app/trust">{t('seeScore')}</Link>
        </Button>
      </p>
    </div>
  );
}
