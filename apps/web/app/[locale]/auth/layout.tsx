import type { ReactNode } from 'react';
import { MotionProvider } from '@/components/motion/motion-provider';

/**
 * Auth route group. Calm motion profile (this is app surface, not marketing) and
 * deliberately OUTSIDE `/{locale}/app/`, so the service worker never caches a
 * sign-in screen — a cached auth page is a stale-session trap (PROMPT 18).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <MotionProvider profile="app">{children}</MotionProvider>;
}
