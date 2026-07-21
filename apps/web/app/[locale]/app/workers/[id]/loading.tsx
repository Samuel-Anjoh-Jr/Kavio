import { Skeleton } from '@/components/ui/skeleton';

/**
 * Profile skeleton in the shape of the real screen (TMDS §20.4: skeletons over
 * spinners). It mirrors the cover, the overlapping avatar and the stat row so
 * nothing jumps when the data lands.
 */
export default function WorkerProfileLoading() {
  return (
    <div className="pb-12">
      <Skeleton className="h-40 w-full rounded-none sm:h-56" />

      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <div className="-mt-12 flex flex-wrap items-end gap-4 sm:-mt-16">
          <Skeleton className="size-24 shrink-0 rounded-full border-4 border-background sm:size-32" />
          <div className="flex-1 space-y-3 pb-1">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-6 w-40 rounded-full" />
          </div>
          <Skeleton className="size-24 shrink-0 rounded-full" />
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-card" />
          ))}
        </div>

        <div className="mt-8 flex gap-3">
          <Skeleton className="h-11 w-40 rounded-button" />
          <Skeleton className="h-11 w-32 rounded-button" />
        </div>

        <Skeleton className="mt-10 h-11 w-full rounded-button" />
        <Skeleton className="mt-6 h-40 w-full rounded-card" />
      </div>
    </div>
  );
}
