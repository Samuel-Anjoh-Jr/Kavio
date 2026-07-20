import type { ReactNode } from 'react';
import { MotionProvider } from '@/components/motion/motion-provider';
import { PageTransition } from '@/components/motion/page-transition';

/**
 * App/dashboard route group: minimal motion, no Lenis (native scroll for
 * dense, data-heavy surfaces per CLAUDE.md §26.2 "app/admin surfaces stay
 * minimal").
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <MotionProvider profile="app">
      <PageTransition>{children}</PageTransition>
    </MotionProvider>
  );
}
