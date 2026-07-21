import { Skeleton } from '@/components/ui/skeleton';

/** Skeletons, never a spinner (SRS §20.4), shaped like the real journey. */
export default function VerificationLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="mt-3 h-4 w-full max-w-md" />

      <Skeleton className="mt-6 h-36 w-full rounded-card" />
      <Skeleton className="mt-6 h-56 w-full rounded-card" />

      <div className="mt-6 rounded-card border border-border bg-surface p-6">
        <Skeleton className="h-5 w-40" />
        <div className="mt-4 space-y-4">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex items-start gap-3">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
