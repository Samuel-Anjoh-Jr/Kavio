'use client';

import { useEffect, useRef } from 'react';
import { animate } from 'animejs';
import { motionDuration, prefersReducedMotion } from '@/lib/motion';

/**
 * The Trust Engine section: a score climbing 15 → 35 → 60 → 82 → 100 as the
 * visitor scrolls (SRS §20.6).
 *
 * This is the page's central argument made visible. The claim is that trust is
 * EARNED IN STAGES, and a static list of tiers states that while a bar that
 * fills one stage at a time as you scroll demonstrates it — which is exactly the
 * "motion explains change" rule the design system asks for (SRS §20.4).
 *
 * Each step is revealed by its own IntersectionObserver rather than by a scroll
 * handler tied to page offsets: observers fire off the main thread, cost nothing
 * while idle, and — unlike hand-computed scroll maths — stay correct when the
 * section moves because the copy above it changed length.
 */
export interface TrustStage {
  score: number;
  label: string;
  description: string;
}

export function TrustEngineProgression({ stages }: { stages: TrustStage[] }) {
  const containerRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-stage]'));
    const reduced = prefersReducedMotion();

    const observers = items.map((item) => {
      const bar = item.querySelector<HTMLElement>('[data-stage-bar]');
      const target = Number(item.dataset.stage ?? 0);

      if (reduced) {
        // The end state still applies — the section is never left half-drawn,
        // it simply arrives without the journey.
        item.style.opacity = '1';
        if (bar) bar.style.transform = `scaleX(${target / 100})`;
        return null;
      }

      item.style.opacity = '0';
      if (bar) bar.style.transform = 'scaleX(0)';

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          observer.disconnect();

          animate(item, {
            opacity: [0, 1],
            translateY: [20, 0],
            duration: motionDuration(500),
            ease: 'outQuad',
          });

          if (bar) {
            // scaleX rather than width: a transform is composited, a width
            // animation relayouts the section on every frame (NFR-PERF-05).
            animate(bar, {
              scaleX: [0, target / 100],
              duration: motionDuration(900),
              ease: 'outExpo',
            });
          }
        },
        { threshold: 0.5 },
      );

      observer.observe(item);
      return observer;
    });

    return () => {
      for (const observer of observers) observer?.disconnect();
    };
  }, [stages]);

  return (
    <ol ref={containerRef} className="flex flex-col gap-8">
      {stages.map((stage) => (
        <li
          key={stage.score}
          data-stage={stage.score}
          className="flex flex-col gap-3 rounded-card bg-surface p-6 shadow-sm"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="font-heading text-lg font-semibold text-surface-foreground">
              {stage.label}
            </h3>
            <span className="font-numeric text-2xl font-semibold text-primary">{stage.score}</span>
          </div>

          <p className="text-sm text-muted-foreground">{stage.description}</p>

          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              data-stage-bar
              className="h-full origin-left rounded-full bg-gradient-to-r from-primary to-accent"
              style={{ transform: 'scaleX(0)' }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
