import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared furniture for the role-based homes (ACC-07, DIS-01).
 *
 * `PendingPanel` is the important one. Several panels these homes are specified
 * to carry — incoming job requests, quotes, earnings — are backed by modules
 * that land in later phases. The choice is between hiding them, faking them, or
 * naming them honestly. Hiding them makes the home look like the product is
 * smaller than it is; faking them is the one thing a trust-first marketplace
 * cannot do. So the panel is rendered, labelled with what it will hold, and
 * marked as not yet available — the user learns the shape of their dashboard
 * without being shown a single invented number.
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
