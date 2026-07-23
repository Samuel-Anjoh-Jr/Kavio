'use client';

import { useEffect, useRef } from 'react';
import { animate } from 'animejs';
import { motionDuration, prefersReducedMotion, stagger } from '@/lib/motion';

/**
 * The waveform beside the featured testimonial (SRS §20.6: "testimonial with a
 * voice waveform").
 *
 * PURELY DECORATIVE, and honest about it. There is no audio element here and no
 * claim that a recording exists — the bars are a visual motif for "someone said
 * this out loud", so the whole thing is `aria-hidden` and never enters the tab
 * order. Drawing a play button that plays nothing would be the dishonest version
 * of this component.
 *
 * The bar heights come from a fixed array rather than `Math.random()`, so the
 * server and client render identical markup — a random waveform is a
 * hydration mismatch waiting to happen.
 */

const BARS = [
  0.3, 0.55, 0.8, 0.45, 0.95, 0.6, 0.35, 0.75, 1, 0.5, 0.65, 0.4, 0.85, 0.55, 0.3, 0.7, 0.9, 0.45,
  0.6, 0.35, 0.8, 0.5, 0.95, 0.4, 0.7,
];

export function VoiceWaveform({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const bars = Array.from(el.children);

    // scaleY, not height: the bars are composited rather than relayouting the
    // row 60 times a second (NFR-PERF-05).
    const animation = animate(bars, {
      scaleY: [
        { to: 0.4, duration: motionDuration(600) },
        { to: 1, duration: motionDuration(600) },
      ],
      delay: stagger(45),
      loop: true,
      alternate: true,
      ease: 'inOutSine',
    });

    // Braces so the cleanup returns void, not the JSAnimation `pause()` gives back.
    return () => {
      animation.pause();
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className={className ?? 'flex h-10 items-center gap-1'}>
      {BARS.map((height, i) => (
        <span
          key={i}
          className="w-1 origin-center rounded-full bg-accent"
          style={{ height: `${Math.round(height * 100)}%` }}
        />
      ))}
    </div>
  );
}
