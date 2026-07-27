'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { Compass, Loader2, MapPinOff, SearchX, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistance } from '@/lib/geo';
import type { WorkerCardData } from '@/lib/discovery';
import type { NoProviderSignal } from '@/lib/graphql/discovery';
import { WorkerCard, WorkerCardSkeleton } from './worker-card';
import { useWindowVirtual } from './use-window-virtual';

/**
 * The results list (DIS-06, DIS-08, DIS-11).
 *
 * ── An empty list is never rendered as an empty list ────────────────────────
 * `noProviders.reason` says WHY there is nothing, and the four answers need four
 * different screens. "Your filters excluded everyone" wants a clear-filters
 * button. "Nobody offers this within 5 km, but somebody does at 12 km" wants a
 * widen-the-radius button with the real number in it. "Nobody on the platform
 * does this yet" wants an honest "check back soon" — and must NOT offer to
 * search wider, because there is nothing wider to find. Showing the same blank
 * box for all four is how a marketplace with real supply looks empty.
 */

/** Estimated card height + gap, for the virtual window. */
const ROW_HEIGHT = 296;

/** Matches the `@2xl`/`@5xl` container-query breakpoints on the grid below. */
const TWO_COL_PX = 672;
const THREE_COL_PX = 1024;

/**
 * Column count from the grid's own rendered width, not the viewport.
 *
 * This list sits full-width on the search screen but squeezed into a ~420px
 * sidebar next to the map on the guest explore page — a viewport-width read
 * would force 3 columns into that sidebar just because the browser window is
 * wide. A `ResizeObserver` on the actual grid box keeps the column count (and
 * therefore the virtualiser's row math) honest in both places.
 */
function useContainerColumns(ref: RefObject<HTMLElement | null>): number {
  // One column until the first measurement: the mobile-first layout is the
  // safe first paint, and the real count arrives before any scrolling can
  // happen.
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setColumns(width >= THREE_COL_PX ? 3 : width >= TWO_COL_PX ? 2 : 1);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
}

export interface WorkerResultsProps {
  workers: WorkerCardData[];
  loading: boolean;
  /** Present on search results; absent on plain proximity rails. */
  noProviders?: NoProviderSignal | null;
  error?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onWidenRadius?: (radiusM: number) => void;
  onClearFilters?: () => void;
  onRetry?: () => void;
}

export function WorkerResults({
  workers,
  loading,
  noProviders,
  error = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onWidenRadius,
  onClearFilters,
  onRetry,
}: WorkerResultsProps) {
  const t = useTranslations('Search');
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useContainerColumns(gridRef);

  const { containerRef, start, end, paddingTop, paddingBottom } = useWindowVirtual({
    itemCount: workers.length,
    columns,
    rowHeight: ROW_HEIGHT,
  });

  // Skeletons, never a spinner, for the first load (TMDS §20.4): a skeleton in
  // the shape of the answer makes a slow connection feel like it is working.
  if (loading && workers.length === 0) {
    return (
      <div ref={gridRef} className="@container">
        <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <WorkerCardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<TriangleAlert aria-hidden className="size-8 text-danger" />}
        title={t('errorTitle')}
        body={t('errorBody')}
        action={onRetry ? <Button onClick={onRetry}>{t('retry')}</Button> : null}
      />
    );
  }

  if (workers.length === 0) {
    return (
      <NoResults
        signal={noProviders}
        onWidenRadius={onWidenRadius}
        onClearFilters={onClearFilters}
      />
    );
  }

  return (
    <>
      <div
        ref={(node) => {
          containerRef.current = node;
          gridRef.current = node;
        }}
        className="@container"
        style={{ paddingTop, paddingBottom }}
      >
        <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {workers.slice(start, end).map((worker) => (
            <WorkerCard key={worker.userId} worker={worker} />
          ))}
        </div>
      </div>

      {hasMore && (
        <div className="mt-8 flex justify-center">
          <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 aria-hidden className="animate-spin" />}
            {t('loadMore')}
          </Button>
        </div>
      )}
    </>
  );
}

function NoResults({
  signal,
  onWidenRadius,
  onClearFilters,
}: {
  signal?: NoProviderSignal | null;
  onWidenRadius?: (radiusM: number) => void;
  onClearFilters?: () => void;
}) {
  const t = useTranslations('Search');
  const reason = signal?.reason ?? 'NO_PROVIDERS_IN_AREA';

  if (reason === 'FILTERED_OUT') {
    return (
      <EmptyState
        icon={<SearchX aria-hidden className="size-8 text-muted-foreground" />}
        title={t('filteredOutTitle')}
        body={t('filteredOutBody')}
        action={
          onClearFilters ? <Button onClick={onClearFilters}>{t('clearFilters')}</Button> : null
        }
      />
    );
  }

  if (reason === 'SERVICE_NOT_ON_PLATFORM') {
    // Deliberately offers no "search wider": there is nobody wider to find, and
    // a button that cannot work is worse than no button.
    return (
      <EmptyState
        icon={<Compass aria-hidden className="size-8 text-accent" />}
        title={t('serviceMissingTitle')}
        body={t('serviceMissingBody')}
      />
    );
  }

  const suggested = signal?.suggestedRadiusM ?? null;
  const nearest = formatDistance(signal?.nearestProviderM, (key, values) =>
    t(`distance.${key}`, values),
  );

  return (
    <EmptyState
      icon={<MapPinOff aria-hidden className="size-8 text-muted-foreground" />}
      title={t('noProvidersTitle')}
      body={nearest ? t('noProvidersBodyNearest', { distance: nearest }) : t('noProvidersBody')}
      action={
        // Only offered when the server said a wider radius would actually find
        // somebody — see NoProviderSignalView.suggestedRadiusM.
        suggested && onWidenRadius ? (
          <Button onClick={() => onWidenRadius(suggested)}>
            {t('widenRadius', { value: String(Math.round(suggested / 1000)) })}
          </Button>
        ) : null
      }
    />
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-muted">{icon}</span>
      <h3 className="font-heading text-lg font-semibold text-foreground">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
