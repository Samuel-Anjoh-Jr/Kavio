import { cn } from '@/lib/utils';

/**
 * A tone-coded status chip, shared by every transactional surface (jobs, quotes,
 * escrow, disputes) so a "Paid" pill reads the same colour on the wallet as it
 * does on a booking.
 *
 * Tone is a semantic decision the caller makes from a status enum, never derived
 * from the label text — the same word can be reassuring on one screen and a
 * warning on another, and the caller is the one that knows which.
 */
export type StatusTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger';

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  primary: 'border-primary/25 bg-primary/10 text-primary',
  accent: 'border-accent/25 bg-accent/10 text-accent-ink',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
};

export function StatusBadge({
  tone,
  label,
  size = 'md',
  className,
}: {
  tone: StatusTone;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        TONE_CLASS[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
