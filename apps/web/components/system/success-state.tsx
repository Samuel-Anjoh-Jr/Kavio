'use client';

import { useEffect, useRef } from 'react';
import { drawCheckmark } from '@/lib/motion';
import { SystemState, type SystemStateProps } from './system-state';

/**
 * The terminal confirmation after a completed flow — payment released, job
 * posted, verification submitted (SYS-04).
 *
 * The checkmark DRAWS rather than appearing, because this is the one state whose
 * whole job is to mark that something changed, and motion that explains change
 * is exactly what TMDS asks for (SRS §20.4). Under prefers-reduced-motion
 * `drawCheckmark` collapses to 0ms, so the mark still ends up fully drawn — the
 * confirmation is never withheld, it just arrives instantly.
 */
export function SuccessState(props: Omit<SystemStateProps, 'tone' | 'icon'>) {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const path = pathRef.current;
    if (path) drawCheckmark(path);
  }, []);

  return (
    <SystemState
      tone="success"
      icon={
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            ref={pathRef}
            d="M4.5 12.75l6 6 9-13.5"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      }
      {...props}
    />
  );
}
