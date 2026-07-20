'use client';

import { ReactLenis } from 'lenis/react';
import type { ReactNode } from 'react';
import { useReducedMotion } from '@/lib/motion';

/**
 * Lenis smooth scroll — mounted only inside the (marketing) route group
 * layout, so it's scoped to marketing routes and never touches the (app)
 * dashboard's scroll behaviour. Disabled outright under reduced motion
 * (`options.autoRaf: false` + syncTouch off falls back to native scroll).
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();

  return (
    <ReactLenis root options={{ autoRaf: !reduced, lerp: reduced ? 1 : 0.1 }}>
      {children}
    </ReactLenis>
  );
}
