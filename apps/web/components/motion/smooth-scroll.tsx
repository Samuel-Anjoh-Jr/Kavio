'use client';

import 'lenis/dist/lenis.css';
import { ReactLenis } from 'lenis/react';
import type { ReactNode } from 'react';
import { useReducedMotion } from '@/lib/motion';

/**
 * Lenis smooth scroll — mounted only inside the (marketing) route group
 * layout, so it's scoped to marketing routes and never touches the app
 * shell's scroll behaviour.
 *
 * Under reduced motion Lenis stays mounted (so the tree does not remount when
 * the setting is read after hydration) but stops smoothing the wheel, which
 * hands scrolling straight back to the browser. Turning off its rAF loop
 * instead would leave Lenis swallowing wheel events with nothing to apply
 * them, and the page would not scroll at all.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();

  return (
    <ReactLenis root options={{ autoRaf: true, smoothWheel: !reduced, lerp: 0.1, anchors: true }}>
      {children}
    </ReactLenis>
  );
}
