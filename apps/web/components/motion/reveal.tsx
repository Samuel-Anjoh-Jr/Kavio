'use client';

import { useRef, type ReactNode } from 'react';
import { animate } from 'animejs';
import { motionDuration, revealUp } from '@/lib/motion';
import { useMotionProfile } from './motion-provider';
import { useInViewOnce } from './use-in-view-once';

/**
 * Reveals its direct children when scrolled into view. Strength follows the
 * ambient MotionProvider profile: "marketing" staggers each child in with a
 * lift; "app" does a single quick fade with no stagger (calm, per SRS §20.4 /
 * CLAUDE.md §26.2 "app/admin surfaces stay minimal"). Reduced motion leaves
 * the server-rendered content exactly as it is.
 *
 * The children are hidden in a layout effect, before the first client paint,
 * and only once JS is running: without that, content that was already visible
 * would blink out and fade back in as it entered the viewport.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const profile = useMotionProfile();

  useInViewOnce(ref, {
    threshold: 0.15,
    prepare: (el) => {
      const targets = profile === 'marketing' ? Array.from(el.children) : [el];
      for (const target of targets) (target as HTMLElement).style.opacity = '0';
    },
    enter: (el) => {
      if (profile === 'marketing') {
        revealUp(Array.from(el.children));
      } else {
        animate(el, { opacity: [0, 1], duration: motionDuration(200), ease: 'outQuad' });
      }
    },
  });

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
