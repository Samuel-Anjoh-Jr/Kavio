'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Lock } from 'lucide-react';
import { animate } from 'animejs';
import { countUp, motionDuration } from '@/lib/motion';
import type { OnboardingUnlock } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

/**
 * Profile completion as unlockable BENEFITS, not a checklist (TRU-05).
 *
 * The framing is deliberate: "80% — unlock the verified badge" tells a worker
 * what they get, where "3 of 5 tasks done" tells them what they owe. The
 * remaining items are shown as locked benefits so the reason to continue is
 * always visible.
 */
export function CompletionMeter({
  percent,
  unlocks,
  namespace,
}: {
  percent: number;
  unlocks: OnboardingUnlock[];
  /** Message namespace holding this role's benefit copy, e.g. "Onboarding.worker". */
  namespace: string;
}) {
  const t = useTranslations(namespace);
  const tShared = useTranslations('Onboarding');
  const barRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const previous = useRef(percent);

  useEffect(() => {
    const bar = barRef.current;
    if (bar) {
      animate(bar, {
        // scaleX rather than width: transform-only keeps this compositor-side
        // and off the layout path (SRS §20.4).
        scaleX: [previous.current / 100, percent / 100],
        duration: motionDuration(600),
        ease: 'outQuad',
      });
    }

    if (valueRef.current) {
      countUp(valueRef.current, {
        from: previous.current,
        to: percent,
        duration: 600,
        format: (value) => `${Math.round(value)}%`,
      });
    }

    previous.current = percent;
  }, [percent]);

  return (
    <section
      aria-labelledby="completion-heading"
      className="rounded-card border border-border bg-surface p-6"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="completion-heading" className="font-heading text-lg font-semibold text-foreground">
          {tShared('completionHeading')}
        </h2>
        <span ref={valueRef} className="font-numeric text-2xl font-semibold text-primary">
          {percent}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-labelledby="completion-heading"
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div ref={barRef} className="h-full origin-left rounded-full bg-primary" />
      </div>

      <ul className="mt-6 space-y-3">
        {unlocks.map((unlock) => (
          <li key={unlock.key} className="flex items-start gap-3">
            <span
              aria-hidden
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
                unlock.unlocked ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
              )}
            >
              {unlock.unlocked ? <Check className="size-3" /> : <Lock className="size-3" />}
            </span>
            <span className="flex flex-col">
              <span
                className={cn(
                  'text-sm font-medium',
                  unlock.unlocked ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {t(`unlocks.${unlock.key}`)}
              </span>
              {!unlock.unlocked && (
                <span className="text-xs text-muted-foreground">
                  {tShared('unlocksAt', { threshold: unlock.threshold })}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
