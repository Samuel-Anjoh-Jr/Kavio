'use client';

import { useEffect, useRef } from 'react';
import { countUp, sweepArc } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * The animated Trust Score gauge (SRS §20.6 "floating trust badge and animated
 * Trust Score").
 *
 * The ring FILLS and the number COUNTS UP rather than both appearing at their
 * final value, because the score is the product's central claim and the motion
 * is what makes a visitor read it as something earned over time instead of a
 * number someone typed. Both presets collapse to 0ms under prefers-reduced-motion,
 * so the final value still lands — instantly, never skipped.
 *
 * The animation is triggered by an IntersectionObserver rather than on mount:
 * a gauge that finished filling before the visitor scrolled to it has animated
 * for nobody.
 */
export function TrustScoreRing({
  score,
  label,
  size = 132,
  className,
}: {
  /** 0–100. */
  score: number;
  label: string;
  size?: number;
  className?: string;
}) {
  const circleRef = useRef<SVGCircleElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const root = rootRef.current;
    const circle = circleRef.current;
    const number = numberRef.current;
    if (!root || !circle || !number) return;

    const clamped = Math.min(Math.max(score, 0), 100);
    const offset = circumference * (1 - clamped / 100);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();

        sweepArc(circle, { circumference, offset });
        countUp(number, { to: clamped, duration: 1_100 });
      },
      { threshold: 0.4 },
    );

    observer.observe(root);
    return () => observer.disconnect();
  }, [score, circumference]);

  return (
    <div
      ref={rootRef}
      className={cn('relative inline-flex items-center justify-center', className)}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        <circle
          ref={circleRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-success"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* The whole gauge is one labelled figure: the ring is decorative, and
            the count-up would otherwise have a live region announcing every
            intermediate number as it ticked. */}
        <span className="sr-only">{label}</span>
        <span
          ref={numberRef}
          aria-hidden="true"
          className="font-numeric text-3xl font-semibold text-foreground"
        >
          0
        </span>
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
}
