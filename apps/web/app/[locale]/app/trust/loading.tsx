import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeletons, never a spinner (SRS §20.4) — the shapes match the real screen so
 * the layout does not jump when the score arrives.
 */
export default function TrustLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
        <Skeleton className="size-36 shrink-0 rounded-full" />
        <div className="flex w-full flex-col items-center gap-2 sm:items-start">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      <Skeleton className="mt-6 h-28 w-full rounded-card" />
      <Skeleton className="mt-6 h-40 w-full rounded-card" />

      <Skeleton className="mt-10 h-6 w-48" />
      <div className="mt-4 grid gap-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-44 w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}
