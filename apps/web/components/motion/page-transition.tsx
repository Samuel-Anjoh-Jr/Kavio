'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from '@/i18n/navigation';
import { pageTransitionIn, motionDuration } from '@/lib/motion';
import { useMotionProfile } from './motion-provider';

/**
 * Replays the page-transition preset whenever the pathname changes. Strength
 * follows the ambient profile: "marketing" gets the full fade+scale+blur;
 * "app" gets a fast plain fade (calm, no blur/scale) so dashboard navigation
 * doesn't feel sluggish.
 *
 * Never on first load: the server-rendered page is already on screen by the
 * time this hydrates, so animating it in from opacity 0 would blank a page the
 * visitor is already reading (and push back the LCP paint on a slow phone).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const profile = useMotionProfile();
  const firstPathname = useRef(pathname);

  useEffect(() => {
    const el = ref.current;
    if (!el || pathname === firstPathname.current) return;
    firstPathname.current = '';

    if (profile === 'marketing') {
      pageTransitionIn(el);
    } else {
      pageTransitionIn(el, {
        scale: [1, 1],
        filter: ['blur(0px)', 'blur(0px)'],
        duration: motionDuration(200),
      });
    }
  }, [pathname, profile]);

  return <div ref={ref}>{children}</div>;
}
