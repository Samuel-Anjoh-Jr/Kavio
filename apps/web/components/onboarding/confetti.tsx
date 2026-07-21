'use client';

import { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * The celebratory unlock, fired ONCE on onboarding completion (ACC-10).
 *
 * Hand-rolled with Anime.js rather than pulling in a confetti library: the
 * effect is forty lines, and the alternative ships a canvas renderer to
 * low-bandwidth phone users for a two-second animation.
 *
 * Skipped entirely under prefers-reduced-motion — this is pure decoration, so
 * unlike the functional presets it has nothing to fall back to.
 */
const PIECE_COUNT = 28;

const COLORS = [
  'var(--color-primary)',
  'var(--color-accent)',
  'var(--color-success)',
  'var(--color-warning)',
];

export function Confetti({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container || fired.current || prefersReducedMotion()) return;

    fired.current = true;

    const pieces = Array.from(container.children) as HTMLElement[];

    animate(pieces, {
      translateY: () => [0, 220 + Math.random() * 220],
      translateX: () => [0, (Math.random() - 0.5) * 320],
      rotate: () => [0, (Math.random() - 0.5) * 720],
      opacity: [1, 0],
      duration: 1600,
      delay: stagger(18),
      ease: 'outQuad',
    });
  }, [active]);

  if (!active) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-24 z-50 flex justify-center"
    >
      {Array.from({ length: PIECE_COUNT }).map((_, index) => (
        <span
          key={index}
          className="absolute size-2 rounded-[2px]"
          style={{ backgroundColor: COLORS[index % COLORS.length] }}
        />
      ))}
    </div>
  );
}
