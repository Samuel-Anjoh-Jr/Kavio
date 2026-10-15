'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { JSAnimation } from 'animejs';
import { Link } from '@/i18n/navigation';
import { scoreTo } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * The Trust Engine section: one score climbing 15 → 35 → 60 → 82 → 100 as the
 * visitor scrolls through the stages that earn it (SRS §20.6).
 *
 * The claim is that trust is EARNED IN STAGES. A list of tiers states that; a
 * single dial that climbs while you read each stage demonstrates it, which is
 * the "motion explains change" rule (SRS §20.4). On desktop the dial sits in
 * the sticky column; on a phone a compact copy pins under the header, so the
 * story still reads as one number rising rather than five separate cards.
 *
 * The active stage is whichever crosses the middle band of the viewport,
 * found with an IntersectionObserver rather than scroll maths, so it stays
 * correct when copy above it changes length. Stages already passed stay
 * filled. Under reduced motion the dial jumps straight to each value.
 */

const SCORES = [15, 35, 60, 82, 100] as const;

export function TrustEngineStory() {
  const t = useTranslations('Marketing.trustEngine');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-stage-index]') ?? [],
    );
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.stageIndex));
          }
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );

    for (const item of items) observer.observe(item);
    return () => observer.disconnect();
  }, []);

  const score = SCORES[active] ?? SCORES[0];
  const stageLabel = t(`stages.${score}.label`);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <h2 className="text-balance font-heading text-3xl font-semibold tracking-[-0.01em] text-foreground sm:text-4xl">
          {t('heading')}
        </h2>
        <p className="max-w-md text-muted-foreground">{t('body')}</p>
        <Link
          href="/app/trust"
          className="w-fit rounded-button text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('link')}
        </Link>

        <div className="mt-6 hidden w-fit items-center gap-6 rounded-card border border-border bg-surface p-6 pr-10 shadow-md lg:flex">
          <Dial score={score} size={168} stroke={12} numberClass="text-5xl" />
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">{t('dialCaption')}</span>
            <span className="font-heading text-lg font-semibold text-surface-foreground">
              {stageLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Phone: a compact dial pinned under the 64px header for the length of
          the list. A grid item, so it sticks within the whole section. */}
      <div
        aria-hidden="true"
        className="sticky top-16 z-10 -mx-4 flex items-center gap-3 border-y border-border bg-background px-4 py-2.5 sm:-mx-6 sm:px-6 lg:hidden"
      >
        <Dial score={score} size={44} stroke={5} numberClass="text-sm" />
        <span className="text-sm text-muted-foreground">{t('dialCaption')}</span>
        <span className="truncate text-sm font-semibold text-foreground">
          {t('dialStage', { stage: stageLabel })}
        </span>
      </div>

      <ol ref={listRef} className="flex flex-col">
        {SCORES.map((stageScore, index) => {
          const reached = index <= active;
          return (
            <li
              key={stageScore}
              data-stage-index={index}
              className="grid grid-cols-[3.5rem_1fr] gap-4 border-t border-border py-8 first:border-t-0 first:pt-0 sm:grid-cols-[4.5rem_1fr] lg:py-12"
            >
              <span
                className={cn(
                  'font-numeric text-2xl font-semibold tabular-nums transition-colors duration-300 sm:text-3xl',
                  reached ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {stageScore}
              </span>
              <div className="flex flex-col gap-2">
                <h3
                  className={cn(
                    'font-heading text-lg font-semibold transition-colors duration-300 sm:text-xl',
                    reached ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {t(`stages.${stageScore}.label`)}
                </h3>
                <p className="max-w-md text-muted-foreground">
                  {t(`stages.${stageScore}.description`)}
                </p>
                <div
                  aria-hidden="true"
                  className="mt-3 h-1.5 max-w-md overflow-hidden rounded-full bg-muted"
                >
                  {/* scaleX, not width: composited, so the bar costs no layout. */}
                  <div
                    className="h-full origin-left bg-primary transition-transform duration-700 ease-out"
                    style={{ transform: `scaleX(${reached ? stageScore / 100 : 0})` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A Trust Score ring that animates from its previous value to the new one. */
function Dial({
  score,
  size,
  stroke,
  numberClass,
}: {
  score: number;
  size: number;
  stroke: number;
  numberClass: string;
}) {
  const circleRef = useRef<SVGCircleElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);
  const live = useRef(score);
  const running = useRef<JSAnimation | null>(null);
  // Rendered once and then driven imperatively: if React re-rendered the
  // number or the offset on each score change, it would overwrite the
  // animation mid-sweep (and fight Anime.js over the same text node).
  const [initial] = useState(score);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const circle = circleRef.current;
    const number = numberRef.current;
    if (!circle || !number || live.current === score) return;

    // Start from wherever the dial is right now, so scrolling back up mid-sweep
    // reverses smoothly instead of snapping.
    running.current?.pause();
    running.current = scoreTo(
      { circle, number },
      {
        from: live.current,
        to: score,
        circumference,
        onValue: (value) => {
          live.current = value;
        },
      },
    );
  }, [score, circumference]);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} className="-rotate-90">
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
          className="stroke-primary"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: circumference * (1 - initial / 100),
          }}
        />
      </svg>
      <span
        ref={numberRef}
        className={cn(
          'absolute inset-0 flex items-center justify-center font-numeric font-semibold tabular-nums text-foreground',
          numberClass,
        )}
      >
        {initial}
      </span>
    </div>
  );
}
