'use client';

import { WorkerCard } from '@/components/discovery/worker-card';
import { searchResultToCard } from '@/lib/discovery';
import type { SearchWorkerResult } from '@/lib/graphql/discovery';

/**
 * `searchResultToCard` and `WorkerCard` both carry `'use client'` (the card
 * uses hooks — save/favourite, hover motion), so the server page hands over
 * the raw search rows here rather than projecting them itself: importing a
 * function from a client-tagged module and CALLING it in a Server Component
 * fails at build time (every export of a `'use client'` file becomes a client
 * reference), even though the function itself has no browser dependency.
 */
export function WorkerPreviewGrid({ workers }: { workers: SearchWorkerResult[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {workers.map((worker) => (
        <WorkerCard key={worker.userId} worker={searchResultToCard(worker)} />
      ))}
    </div>
  );
}
