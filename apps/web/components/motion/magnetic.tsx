'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { animate } from 'animejs';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * Pulls its child a few pixels toward the pointer, then springs back on leave.
 * Reserved for the one primary CTA in the hero (DESIGN.md): it rewards the
 * hand already moving toward the button and nothing else on the page does it.
 *
 * Fine pointers only. A touch screen has no hover to follow, and under
 * prefers-reduced-motion the button stays still.
 */
export function Magnetic({ children, strength = 6 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia('(pointer: fine)').matches || prefersReducedMotion()) return;

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const y = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      animate(el, {
        translateX: x * strength,
        translateY: y * strength * 0.6,
        duration: 200,
        ease: 'outQuad',
      });
    };

    const onLeave = () => {
      animate(el, { translateX: 0, translateY: 0, duration: 500, ease: 'outElastic(1, 0.5)' });
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [strength]);

  return (
    <span ref={ref} className="inline-flex">
      {children}
    </span>
  );
}
