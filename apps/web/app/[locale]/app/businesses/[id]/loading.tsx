import { Skeleton } from '@/components/ui/skeleton';

/** Company profile skeleton, matching the real screen's geometry. */
export default function BusinessProfileLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start gap-4">
        <Skeleton className="size-20 shrink-0 rounded-card sm:size-24" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-48 rounded-full" />
        </div>
        <Skeleton className="size-24 shrink-0 rounded-full" />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-card" />
        ))}
      </div>

      <Skeleton className="mt-10 h-11 w-full rounded-button" />
      <Skeleton className="mt-6 h-40 w-full rounded-card" />
    </div>
  );
}
