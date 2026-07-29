import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared furniture for the role-based homes (ACC-07, DIS-01).
 *
 * `PendingPanel` renders a labelled, dashed-border placeholder. Two honest uses:
 * a panel with nothing in it yet (an empty state — see dashboard-panels.tsx,
 * which reads the real data and falls back to this), and the business
 * console's own numbers, which stay behind the console rather than being
 * duplicated here (see BusinessHome in app/home/page.tsx). Neither is an
 * invented number — the difference between "empty" and "not built" matters in
 * a trust-first marketplace, so this component never stands in for the latter.
 */

export function HomeSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mt-10', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-numeric text-2xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PendingPanel({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-dashed border-border bg-surface/50 p-5">
      {icon && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </span>
      )}
      <div>
        <h3 className="font-medium text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
