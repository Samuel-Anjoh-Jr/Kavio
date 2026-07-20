import type { ReactNode } from 'react';
import { MotionProvider } from '@/components/motion/motion-provider';
import { PageTransition } from '@/components/motion/page-transition';
import { SmoothScroll } from '@/components/motion/smooth-scroll';

/**
 * Marketing route group: strong staggered reveals (via Reveal) + Lenis smooth
 * scroll, both scoped to this group only (SRS §20.4). The marketing landing
 * page is also excluded from the PWA service-worker scope — that's handled
 * separately at the routing/SW-config layer, not here.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <MotionProvider profile="marketing">
      <SmoothScroll>
        <PageTransition>{children}</PageTransition>
      </SmoothScroll>
    </MotionProvider>
  );
}
