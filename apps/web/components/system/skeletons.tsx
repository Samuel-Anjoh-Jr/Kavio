import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Shared loading shapes (SYS-04: "skeletons, not spinners").
 *
 * A spinner says "wait" and nothing else; a skeleton that matches the layout it
 * replaces reserves the space the real content will occupy, so nothing shifts
 * when it arrives. That is also why these are the loading state of choice for
 * NFR-PERF (CLS < 0.1) — the skeleton IS the layout reservation.
 *
 * Every shape here is `aria-hidden` behind a single live-region label on the
 * wrapper, so a screen reader announces "Loading" once instead of reading a
 * dozen meaningless empty boxes.
 */

function LoadingRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  );
}

/** A stack of list rows — messages, transactions, notifications. */
export function ListSkeleton({
  rows = 5,
  label,
  className,
}: {
  rows?: number;
  label: string;
  className?: string;
}) {
  return (
    <LoadingRegion label={label} className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-card bg-surface p-4 shadow-sm">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

/** A responsive grid of cards — worker results, job feed, portfolio. */
export function CardGridSkeleton({
  cards = 6,
  label,
  className,
}: {
  cards?: number;
  label: string;
  className?: string;
}) {
  return (
    <LoadingRegion
      label={label}
      className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}
    >
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-sm">
          <Skeleton className="aspect-[4/3] w-full rounded-image" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-4/5" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

/** A detail screen — worker profile, job detail. */
export function DetailSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <LoadingRegion label={label} className={cn('flex flex-col gap-6', className)}>
      <Skeleton className="h-40 w-full rounded-image" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </LoadingRegion>
  );
}

/** Plain paragraph lines, for a text block of unknown shape. */
export function TextSkeleton({
  lines = 3,
  label,
  className,
}: {
  lines?: number;
  label: string;
  className?: string;
}) {
  return (
    <LoadingRegion label={label} className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </LoadingRegion>
  );
}
