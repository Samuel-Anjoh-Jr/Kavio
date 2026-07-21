'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { animate } from 'animejs';
import { useSession } from 'next-auth/react';
import { motionDuration } from '@/lib/motion';

/**
 * Animates the experience swap when the active role changes (ACC-07: "swaps the
 * available experience instantly with an animated transition").
 *
 * The animation exists to EXPLAIN the change — the whole surface is now a
 * different role's app — rather than to decorate it. Transform and opacity only,
 * and `motionDuration` collapses it to an instant swap under
 * prefers-reduced-motion, so the content still changes, it just does not move.
 */
export function RoleTransition({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const activeRole = session?.user?.activeRole;
  const previousRole = useRef<string | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el || !activeRole) return;

    // Skip the very first resolution: mounting is not a role change, and
    // animating it would flash the shell on every page load.
    if (previousRole.current === undefined) {
      previousRole.current = activeRole;
      return;
    }

    if (previousRole.current === activeRole) return;
    previousRole.current = activeRole;

    animate(el, {
      opacity: [0, 1],
      translateY: [8, 0],
      scale: [0.99, 1],
      duration: motionDuration(320),
      ease: 'outQuad',
    });
  }, [activeRole]);

  return <div ref={ref}>{children}</div>;
}
