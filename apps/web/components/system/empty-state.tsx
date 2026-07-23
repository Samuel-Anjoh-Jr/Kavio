import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { SystemState, type SystemStateProps } from './system-state';

/**
 * "Nothing here (yet)" — the state a list reaches legitimately (SYS-04).
 *
 * Separate from the error states on purpose: an empty result is not a failure,
 * and rendering it in a danger tone teaches users to distrust a working screen.
 * Tone stays neutral and the copy is expected to name the next action.
 */
export function EmptyState({
  icon = <Inbox aria-hidden="true" />,
  variant = 'inline',
  ...props
}: Omit<SystemStateProps, 'tone'> & { icon?: ReactNode }) {
  return <SystemState tone="neutral" icon={icon} variant={variant} {...props} />;
}
