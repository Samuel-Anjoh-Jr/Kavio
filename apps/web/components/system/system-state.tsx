import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The one branded shell every system state renders through (SYS-04): 404, 500,
 * offline, maintenance, empty and success all differ in icon, tone and copy —
 * never in layout. Centralising the frame is what stops "no results" on search
 * looking like a different product from "no results" on the job list.
 *
 * Deliberately a SERVER component with no motion of its own. Several of these
 * render inside error boundaries and offline fallbacks, i.e. exactly the moments
 * when the least machinery should stand between the user and the message. The
 * one state that does animate (success) wraps this and adds the checkmark draw.
 */

export type SystemStateTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const TONE_RING: Record<SystemStateTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
};

export interface SystemStateProps {
  /** Rendered inside the tinted disc. Should already be `aria-hidden`. */
  icon?: ReactNode;
  tone?: SystemStateTone;
  title: string;
  description?: string;
  /** Primary affordance — usually a Button or a Link styled as one. */
  action?: ReactNode;
  /** A quieter escape hatch beside the primary action. */
  secondaryAction?: ReactNode;
  /**
   * A support reference (an error digest, a requestId). Shown in monospace so a
   * user can read it down a phone line to support without transcription errors.
   */
  reference?: string;
  /** `page` fills the viewport; `inline` sits inside a card or list slot. */
  variant?: 'page' | 'inline';
  className?: string;
}

export function SystemState({
  icon,
  tone = 'neutral',
  title,
  description,
  action,
  secondaryAction,
  reference,
  variant = 'page',
  className,
}: SystemStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 text-center',
        variant === 'page' ? 'flex-1 px-6 py-24' : 'px-6 py-12',
        className,
      )}
    >
      {icon && (
        <span
          className={cn(
            'flex items-center justify-center rounded-image',
            TONE_RING[tone],
            variant === 'page' ? 'size-16 [&_svg]:size-8' : 'size-12 [&_svg]:size-6',
          )}
        >
          {icon}
        </span>
      )}

      <div className="flex max-w-md flex-col gap-2">
        <h2
          className={cn(
            'font-heading font-semibold text-foreground',
            variant === 'page' ? 'text-2xl' : 'text-lg',
          )}
        >
          {title}
        </h2>
        {description && <p className="text-balance text-muted-foreground">{description}</p>}
      </div>

      {reference && (
        <p className="rounded-input bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
          {reference}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
