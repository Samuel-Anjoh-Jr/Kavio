'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { OnboardingRole } from '@/lib/onboarding';
import { trustImprovementHref } from '@/lib/trust-actions';
import { NextTierCard } from './next-tier-card';
import { SubScoreCard } from './sub-score-card';
import { TierBadge } from './tier-badge';
import { TrustScoreRing } from './trust-score-ring';
import { orderedSubScores, type TrustBreakdown } from '@/lib/trust';

/**
 * The Trust Score breakdown screen (TRU-04): each sub-score, the inputs behind
 * it, and concrete steps to raise it.
 *
 * Ordering is deliberate — score, then the single most valuable next action,
 * then the tier gate, then the four pillars. A user who reads only the first
 * screenful should already know the one thing to do next.
 */
export function TrustBreakdownView({
  breakdown,
  isOwnScore,
  activeRole = null,
}: {
  breakdown: TrustBreakdown;
  /** Drives the second person: "your score" vs "this professional's score". */
  isOwnScore: boolean;
  /** Decides which onboarding flow a next action's link points at. Only ever
   *  relevant for `isOwnScore` — a third party has no next actions to take. */
  activeRole?: OnboardingRole | null;
}) {
  const t = useTranslations('Trust');
  const subScores = orderedSubScores(breakdown.subScores);

  // `improvements` is null when the API withheld it — a third party has no
  // business seeing how far along someone else's verification is.
  const topImprovement = breakdown.improvements?.[0] ?? null;
  const topImprovementHref = topImprovement
    ? trustImprovementHref(topImprovement.type, activeRole, breakdown.subjectId)
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
        <TrustScoreRing
          score={breakdown.total}
          tier={breakdown.tier}
          suspended={breakdown.suspended}
          size="lg"
          showLabel={false}
        />

        <div className="flex flex-col items-center gap-2 sm:items-start">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {isOwnScore ? t('breakdownHeading') : t('breakdownHeadingOther')}
          </h1>
          <TierBadge tier={breakdown.tier} suspended={breakdown.suspended} />
          {!breakdown.suspended && (
            <p className="text-sm text-muted-foreground">
              {t('outOf', { score: breakdown.total })}
            </p>
          )}
        </div>
      </header>

      {isOwnScore && !breakdown.suspended && (
        <p className="mt-6 text-sm text-muted-foreground">{t('breakdownScopeNote')}</p>
      )}

      {breakdown.suspended && (
        <p
          role="alert"
          className="mt-6 flex items-start gap-2 rounded-card border border-danger/25 bg-danger/10 p-4 text-sm text-danger"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t('suspended')}
        </p>
      )}

      {/* A suspended identity gets no "next action" list. Coaching someone
          towards a higher score while their account is void would be absurd. */}
      {!breakdown.suspended && topImprovement && (
        <section
          aria-labelledby="top-action-heading"
          className="mt-6 rounded-card border border-accent/25 bg-accent/10 p-5 sm:p-6"
        >
          <h2
            id="top-action-heading"
            className="text-xs font-semibold tracking-wide text-accent uppercase"
          >
            {t('topActionHeading')}
          </h2>
          {topImprovementHref ? (
            <Link
              href={topImprovementHref}
              className="mt-2 flex items-start gap-2 rounded-input text-base font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ArrowRight aria-hidden className="mt-1 size-4 shrink-0 text-accent" />
              {t(`improve.${topImprovement.type}`)}
            </Link>
          ) : (
            <p className="mt-2 flex items-start gap-2 text-base font-medium text-foreground">
              <ArrowRight aria-hidden className="mt-1 size-4 shrink-0 text-accent" />
              {t(`improve.${topImprovement.type}`)}
            </p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {t('topActionWorth', { points: topImprovement.max - topImprovement.points })}
          </p>
        </section>
      )}

      {!breakdown.suspended && (
        <div className="mt-6">
          <NextTierCard tierStatus={breakdown.tierStatus} />
        </div>
      )}

      <h2 className="mt-10 font-heading text-lg font-semibold text-foreground">
        {t('pillarsHeading')}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('pillarsBody')}</p>

      <div className="mt-4 grid gap-4">
        {subScores.map((sub, index) => (
          <SubScoreCard
            key={sub.pillar}
            sub={sub}
            index={index}
            activeRole={activeRole}
            subjectId={breakdown.subjectId}
          />
        ))}
      </div>
    </div>
  );
}
