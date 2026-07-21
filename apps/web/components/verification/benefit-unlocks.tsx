'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Lock, Sparkles } from 'lucide-react';
import { animate, stagger } from 'animejs';
import { motionDuration, prefersReducedMotion } from '@/lib/motion';
import { TierBadge } from '@/components/trust/tier-badge';
import { benefitUnlocks, newlyUnlocked, type BenefitUnlock, type Tier } from '@/lib/verification';
import { cn } from '@/lib/utils';

/**
 * Benefits as unlocks, animating the moment a tier is earned (TRU-05).
 *
 * The animation is the point of the requirement, so it is scoped tightly: only
 * tiers that CHANGED since the last render pop. Re-animating every unlocked row
 * on each poll would turn a moment of reward into visual noise, and after the
 * third time it stops reading as an achievement at all.
 */
export function BenefitUnlocks({ tier }: { tier: Tier }) {
  const t = useTranslations('Trust');
  const tVerify = useTranslations('VerificationScreen');
  const listRef = useRef<HTMLUListElement>(null);
  const unlocks = benefitUnlocks(tier);

  // Seeded with the CURRENT unlocks so a first paint animates nothing. Someone
  // arriving already at Tier 2 has not just earned it.
  const previous = useRef<BenefitUnlock[]>(unlocks);

  useEffect(() => {
    const earned = newlyUnlocked(previous.current, unlocks);
    previous.current = unlocks;

    if (earned.length === 0 || !listRef.current) return;

    const nodes = earned
      .map((earnedTier) => listRef.current?.querySelector(`[data-tier="${earnedTier}"]`))
      .filter((node): node is Element => node !== null && node !== undefined);

    if (nodes.length === 0) return;

    // Transform + opacity only, and motionDuration collapses to 0 under
    // prefers-reduced-motion so the end state still applies instantly.
    animate(nodes, {
      scale: [
        { to: 1.06, duration: motionDuration(180) },
        { to: 1, duration: motionDuration(220) },
      ],
      opacity: [0.6, 1],
      delay: stagger(prefersReducedMotion() ? 0 : 90),
      ease: 'outQuad',
    });
  }, [unlocks]);

  return (
    <section
      aria-labelledby="unlocks-heading"
      className="rounded-card border border-border bg-surface p-5 sm:p-6"
    >
      <h2 id="unlocks-heading" className="font-heading text-base font-semibold text-foreground">
        {tVerify('unlocksHeading')}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{tVerify('unlocksBody')}</p>

      <ul ref={listRef} className="mt-4 space-y-3">
        {unlocks.map((unlock) => (
          <li
            key={unlock.tier}
            data-tier={unlock.tier}
            className={cn(
              'flex items-start gap-3 rounded-input border p-3 transition-colors',
              unlock.unlocked ? 'border-success/25 bg-success/5' : 'border-border bg-muted/40',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
                unlock.unlocked ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
              )}
            >
              {unlock.unlocked ? <Sparkles className="size-3.5" /> : <Lock className="size-3.5" />}
            </span>

            <span className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <TierBadge tier={unlock.tier} size="sm" />
                {!unlock.unlocked && (
                  <span className="text-xs text-muted-foreground">{tVerify('locked')}</span>
                )}
              </span>
              <span
                className={cn(
                  'text-sm',
                  unlock.unlocked ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {t(`unlock.${unlock.tier}`)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
