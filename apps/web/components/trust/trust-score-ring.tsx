'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { countUp, sweepArc } from '@/lib/motion';
import { ringGeometry, tierPresentation, type TrustTone, type VerificationTier } from '@/lib/trust';
import { cn } from '@/lib/utils';

/**
 * The Trust Score ring (TRU-01): an animated gauge with a counting-up number,
 * rendered wherever an identity appears.
 *
 * Colour comes from the TIER, never the score (see lib/trust.ts) — a high number
 * on an unverified profile must not borrow the visual language of a verified
 * one (TRU-03).
 *
 * The arc is drawn from the 12 o'clock position with a -90° rotation on the
 * group, which is a static transform rather than an animated one.
 */

const ARC_TONE: Record<TrustTone, string> = {
  neutral: 'stroke-neutral-400 dark:stroke-neutral-500',
  accent: 'stroke-accent-ink',
  success: 'stroke-success',
  primary: 'stroke-primary',
  danger: 'stroke-danger',
};

const VALUE_TONE: Record<TrustTone, string> = {
  neutral: 'text-muted-foreground',
  accent: 'text-accent-ink',
  success: 'text-success',
  primary: 'text-primary',
  danger: 'text-danger',
};

const SIZES = {
  sm: { size: 56, stroke: 6, value: 'text-base', caption: 'text-[10px]' },
  md: { size: 96, stroke: 8, value: 'text-2xl', caption: 'text-xs' },
  lg: { size: 144, stroke: 12, value: 'text-4xl', caption: 'text-sm' },
} as const;

export type TrustScoreRingSize = keyof typeof SIZES;

export function TrustScoreRing({
  score,
  tier,
  suspended = false,
  size = 'md',
  showLabel = true,
  className,
}: {
  score: number;
  tier: VerificationTier;
  suspended?: boolean;
  size?: TrustScoreRingSize;
  /** Hide the "Trust Score" caption when the surrounding context already says it. */
  showLabel?: boolean;
  className?: string;
}) {
  const t = useTranslations('Trust');
  const arcRef = useRef<SVGCircleElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);

  const dims = SIZES[size];
  const geometry = ringGeometry(score, dims.size, dims.stroke);
  const { tone } = tierPresentation(tier, suspended);

  // A suspended score is void (TRU-08), so the ring shows no earned progress —
  // rendering 62/100 in danger-red would still be rendering 62 out of 100.
  const displayed = suspended ? 0 : geometry.value;

  useEffect(() => {
    const arc = arcRef.current;
    if (arc) {
      sweepArc(arc, {
        circumference: geometry.circumference,
        offset: suspended ? geometry.circumference : geometry.offset,
      });
    }

    if (valueRef.current) {
      countUp(valueRef.current, {
        from: previous.current,
        to: displayed,
        format: (value) => String(Math.round(value)),
      });
    }

    previous.current = displayed;
  }, [displayed, suspended, geometry.circumference, geometry.offset]);

  return (
    <div
      className={cn('inline-flex flex-col items-center gap-1', className)}
      // One accessible name for the whole widget: a screen reader gets
      // "Trust Score: 62 out of 100", not a stray number next to a graphic.
      role="img"
      aria-label={`${t('scoreLabel')}: ${suspended ? t('suspendedShort') : t('outOf', { score: displayed })}`}
    >
      <div className="relative" style={{ width: dims.size, height: dims.size }}>
        <svg
          width={dims.size}
          height={dims.size}
          viewBox={`0 0 ${dims.size} ${dims.size}`}
          aria-hidden
          className="-rotate-90"
        >
          <circle
            cx={geometry.center}
            cy={geometry.center}
            r={geometry.radius}
            fill="none"
            strokeWidth={dims.stroke}
            className="stroke-muted"
          />
          <circle
            ref={arcRef}
            cx={geometry.center}
            cy={geometry.center}
            r={geometry.radius}
            fill="none"
            strokeWidth={dims.stroke}
            strokeLinecap="round"
            // Server-rendered end state, so the ring is correct before hydration
            // and with JavaScript unavailable; the effect only animates INTO it.
            strokeDasharray={geometry.circumference}
            strokeDashoffset={suspended ? geometry.circumference : geometry.offset}
            className={cn('transition-colors', ARC_TONE[tone])}
          />
        </svg>

        <span
          aria-hidden
          className="absolute inset-0 flex flex-col items-center justify-center leading-none"
        >
          <span
            ref={valueRef}
            className={cn('font-numeric font-semibold tabular-nums', dims.value, VALUE_TONE[tone])}
          >
            {displayed}
          </span>
        </span>
      </div>

      {showLabel && (
        <span aria-hidden className={cn('text-muted-foreground', dims.caption)}>
          {t('scoreLabel')}
        </span>
      )}
    </div>
  );
}
