'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Check } from 'lucide-react';
import { animate } from 'animejs';
import { Link } from '@/i18n/navigation';
import { motionDuration } from '@/lib/motion';
import type { OnboardingRole } from '@/lib/onboarding';
import { pillarHeadroom, pillarImprovements, subScoreRatio, type TrustSubScore } from '@/lib/trust';
import { trustImprovementHref } from '@/lib/trust-actions';
import { cn } from '@/lib/utils';

/**
 * One of the four pillars on the breakdown screen (TRU-04): what the pillar
 * asks, where the user stands, the inputs behind it, and what to do next.
 *
 * A pillar with `scored: false` (Financial, until Campay escrow ships) renders
 * as "not counting yet" rather than as a zero — the user has not failed at
 * something that does not exist yet.
 */
export function SubScoreCard({
  sub,
  index,
  activeRole = null,
  subjectId,
}: {
  sub: TrustSubScore;
  index: number;
  activeRole?: OnboardingRole | null;
  subjectId: string;
}) {
  const t = useTranslations('Trust');
  const barRef = useRef<HTMLDivElement>(null);

  const ratio = subScoreRatio(sub);
  const improvements = pillarImprovements(sub);
  const headroom = pillarHeadroom(sub);
  const earnedInputs = sub.contributions.filter((c) => c.points !== 0);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    // scaleX, not width: transform-only stays off the layout path (SRS §20.4).
    animate(bar, {
      scaleX: [0, ratio],
      duration: motionDuration(700),
      // Staggered by pillar so the four bars read as one sequence rather than
      // four things happening at once.
      delay: motionDuration(index * 90),
      ease: 'outQuad',
    });
  }, [ratio, index]);

  const headingId = `pillar-${sub.pillar}`;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-card border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id={headingId} className="font-heading text-base font-semibold text-foreground">
            {t(`pillar.${sub.pillar}`)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t(`pillarQuestion.${sub.pillar}`)}</p>
        </div>

        {sub.scored ? (
          <p className="shrink-0 font-numeric text-sm font-semibold text-foreground tabular-nums">
            {t('pillarPoints', { points: sub.points, max: sub.max })}
          </p>
        ) : (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t('pillarComingSoon')}
          </span>
        )}
      </div>

      {sub.scored && (
        <div
          role="progressbar"
          aria-valuenow={sub.points}
          aria-valuemin={0}
          aria-valuemax={sub.max}
          aria-labelledby={headingId}
          className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div ref={barRef} className="h-full origin-left rounded-full bg-primary" />
        </div>
      )}

      {!sub.scored && <p className="mt-4 text-sm text-muted-foreground">{t('pillarUnscored')}</p>}

      {earnedInputs.length > 0 && (
        <>
          <h4 className="mt-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('inputsHeading')}
          </h4>
          <ul className="mt-2 space-y-1.5">
            {earnedInputs.map((input) => (
              <li
                key={input.type}
                className="flex items-baseline justify-between gap-3 text-sm text-foreground"
              >
                <span className="flex items-center gap-2">
                  {input.maxed && <Check aria-hidden className="size-3.5 shrink-0 text-success" />}
                  {t(`improve.${input.type}`)}
                </span>
                <span
                  className={cn(
                    'shrink-0 font-numeric tabular-nums',
                    input.points < 0 ? 'text-danger' : 'text-muted-foreground',
                  )}
                >
                  {t('pointsValue', { points: input.points })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {improvements.length > 0 && (
        <>
          <h4 className="mt-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('nextActionsHeading', { points: headroom })}
          </h4>
          <ul className="mt-2 space-y-1.5">
            {improvements.map((improvement) => {
              const href = trustImprovementHref(improvement.type, activeRole, subjectId);
              return (
                <li key={improvement.type} className="flex items-start gap-2 text-sm">
                  <ArrowRight aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  {href ? (
                    <Link
                      href={href}
                      className="rounded-input text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {t(`improve.${improvement.type}`)}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">
                      {t(`improve.${improvement.type}`)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
