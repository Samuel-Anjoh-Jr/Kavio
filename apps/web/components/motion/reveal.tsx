'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { animate } from 'animejs';
import { motionDuration, stagger } from '@/lib/motion';
import { useMotionProfile } from './motion-provider';

/**
 * Reveals its direct children when scrolled into view. Strength follows the
 * ambient MotionProvider profile: "marketing" staggers each child in with a
 * lift; "app" does a single quick fade with no stagger (calm, per SRS §20.4 /
 * CLAUDE.md §26.2 "app/admin surfaces stay minimal"). Reduced motion collapses
 * both to an instant, un-animated appearance.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const profile = useMotionProfile();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const targets = profile === 'marketing' ? Array.from(el.children) : el;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();

        if (profile === 'marketing') {
          animate(targets, {
            opacity: [0, 1],
            translateY: [16, 0],
            duration: motionDuration(500),
            delay: stagger(80),
            ease: 'outQuad',
          });
        } else {
          animate(el, {
            opacity: [0, 1],
            duration: motionDuration(200),
            ease: 'outQuad',
          });
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [profile]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
