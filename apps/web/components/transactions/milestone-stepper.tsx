'use client';

import { Check } from 'lucide-react';
import type { StatusTone } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

/**
 * A vertical milestone ladder, shared by the Job-in-Progress timeline (JOB-06)
 * and the escrow timeline (PAY-02) — both are the same shape: an ordered set of
 * states a thing climbs, with everything up to and including "now" complete and
 * the rest still to come.
 *
 * Motion explains the change and nothing else: reached rungs and the connector
 * fill transition in, and only under motion-safe — a user who asked for reduced
 * motion sees the same end state with no movement (TMDS §20.4).
 */

export interface Milestone {
  key: string;
  label: string;
  caption?: string;
  /** Timestamp text shown once the rung is reached. */
  at?: string;
}

const REACHED_TONE: Record<StatusTone, string> = {
  neutral:
    'border-neutral-400 bg-neutral-400 text-white dark:border-neutral-500 dark:bg-neutral-500',
  primary: 'border-primary bg-primary text-primary-foreground',
  accent: 'border-accent bg-accent text-accent-foreground',
  success: 'border-success bg-success text-success-foreground',
  warning: 'border-warning bg-warning text-white',
  danger: 'border-danger bg-danger text-danger-foreground',
};

const CONNECTOR_TONE: Record<StatusTone, string> = {
  neutral: 'bg-neutral-400 dark:bg-neutral-500',
  primary: 'bg-primary',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export function MilestoneStepper({
  steps,
  currentIndex,
  tone = 'primary',
}: {
  steps: Milestone[];
  /** Index of the furthest reached rung; -1 when nothing has started. */
  currentIndex: number;
  tone?: StatusTone;
}) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => {
        const reached = index <= currentIndex;
        const isCurrent = index === currentIndex;
        const connectorReached = index < currentIndex;
        const last = index === steps.length - 1;

        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-500',
                  reached ? REACHED_TONE[tone] : 'border-border bg-muted text-muted-foreground',
                  isCurrent && 'motion-safe:animate-pulse',
                )}
              >
                {reached ? (
                  <Check className="size-4" />
                ) : (
                  <span className="text-xs">{index + 1}</span>
                )}
              </span>
              {!last && (
                <span className="relative my-1 w-0.5 flex-1 overflow-hidden rounded-full bg-border">
                  <span
                    className={cn(
                      'absolute inset-x-0 top-0 origin-top transition-transform duration-700 motion-reduce:transition-none',
                      CONNECTOR_TONE[tone],
                      connectorReached ? 'h-full scale-y-100' : 'h-full scale-y-0',
                    )}
                  />
                </span>
              )}
            </div>

            <div className={cn('flex flex-col gap-0.5 pb-6', last && 'pb-0')}>
              <span
                className={cn(
                  'text-sm font-medium',
                  reached ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
              {step.caption && (
                <span className="text-xs text-muted-foreground">{step.caption}</span>
              )}
              {step.at && reached && (
                <span className="font-numeric text-xs text-muted-foreground">{step.at}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
