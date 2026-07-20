'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type MotionProfile = 'marketing' | 'app';

const MotionProfileContext = createContext<MotionProfile>('app');

/**
 * Selects the ambient motion profile for a route group (SRS §20.4): marketing
 * routes get strong staggered reveals, app/admin surfaces stay calm and
 * minimal. Mount once per route group layout — see (marketing)/layout.tsx
 * and (app)/layout.tsx.
 */
export function MotionProvider({
  profile,
  children,
}: {
  profile: MotionProfile;
  children: ReactNode;
}) {
  return <MotionProfileContext.Provider value={profile}>{children}</MotionProfileContext.Provider>;
}

export function useMotionProfile(): MotionProfile {
  return useContext(MotionProfileContext);
}
