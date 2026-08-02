'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useViewerSeed } from '@/lib/viewer-seed';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { Bookmark, BookmarkCheck, List, Map as MapIcon } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { searchResultToCard } from '@/lib/discovery';
import { saveSearch } from '@/lib/discovery';
import { isValidCoordinate } from '@/lib/geo';
import { SEARCH_WORKERS_QUERY, type SearchWorkersQueryResult } from '@/lib/graphql/discovery';
import {
  activeFilterCount,
  clearFilters,
  PAGE_SIZE,
  serialiseFilters,
  toSearchVariables,
  type SearchFilters,
} from '@/lib/search-filters';
import { cn } from '@/lib/utils';
import { FilterDrawer } from './filter-drawer';
import { LocationSetter } from './location-setter';
import { SearchBar } from './search-bar';
import { useBrowsingLocation } from './location-provider';
import { useDebouncedValue } from './use-debounced-value';
import { WorkerMap } from './worker-map';
import { WorkerResults } from './worker-results';

/**
 * The search surface (DIS-03…DIS-08, DIS-11).
 *
 * ── The URL is the state ────────────────────────────────────────────────────
 * Every filter round-trips through the querystring, so a search is shareable,
 * Back undoes a filter instead of leaving the screen, and a reload on a dropped
 * connection resumes exactly where the user was. `router.replace` rather than
 * `push` while typing: one search should be one history entry, not one per
 * keystroke.
 *
 * ── The chosen location leads ───────────────────────────────────────────────
 * When the user sets a location anywhere in the app, this screen adopts it as
 * the search origin (CLAUDE.md: "the set location drives feed and search"). It
 * does not overwrite an origin that came in on a shared link, because that link
 * was about somewhere specific.
 */
export function SearchScreen({ initialFilters }: { initialFilters: SearchFilters }) {
  const t = useTranslations('Search');
  const router = useRouter();
  const { toast } = useToast();
  const { location } = useBrowsingLocation();

  const [rawFilters, setFilters] = useState(initialFilters);
  const [queryText, setQueryText] = useState(initialFilters.query ?? '');
  /** The querystring the user last saved, so the control disarms for that exact search. */
  const [savedSearch, setSavedSearch] = useState<string | null>(null);
  /** Same list/map split the guest first-interface offers (DIS-10) — signing in
   * should not take a capability away. */
  const [view, setView] = useState<'list' | 'map'>('list');

  const debouncedQuery = useDebouncedValue(queryText, 300);

  /**
   * The filters actually in force.
   *
   * The app-wide location fills in an origin the URL did not carry, DERIVED
   * rather than copied into state: a shared link is about somewhere specific and
   * must keep its own origin, while a plain visit should search where the user
   * said they are. Deriving it means setting a location elsewhere in the app is
   * reflected here immediately, with no synchronising effect to get wrong.
   */
  const filters = useMemo<SearchFilters>(() => {
    const withQuery = { ...rawFilters, query: debouncedQuery.trim() || null };

    if (isValidCoordinate(withQuery.latitude, withQuery.longitude) || !location) {
      return withQuery;
    }

    return {
      ...withQuery,
      latitude: location.latitude,
      longitude: location.longitude,
      radiusM: location.radiusM,
    };
  }, [rawFilters, debouncedQuery, location]);

  // Keep the URL in step with what the user can see. `replace`, not `push`:
  // one search is one history entry, not one per keystroke.
  useEffect(() => {
    const querystring = serialiseFilters(filters);
    router.replace(querystring ? `/app/search?${querystring}` : '/app/search', { scroll: false });
  }, [filters, router]);

  const viewerSeed = useViewerSeed();

  const variables = useMemo(
    () => ({ ...toSearchVariables(filters), viewerSeed }),
    [filters, viewerSeed],
  );

  const { data, loading, error, refetch } = useQuery<SearchWorkersQueryResult>(
    SEARCH_WORKERS_QUERY,
    {
      variables,
      // The result set changes as workers are verified and priced; a cached
      // page would show a visitor yesterday's marketplace.
      fetchPolicy: 'cache-and-network',
      notifyOnNetworkStatusChange: true,
    },
  );

  const result = data?.searchWorkers;
  const workers = useMemo(() => (result?.workers ?? []).map(searchResultToCard), [result?.workers]);

  const onApplyFilters = useCallback((next: SearchFilters) => {
    // A new filter set is a new result set, so paging starts over — keeping the
    // grown limit would silently request five pages of something else.
    setFilters({ ...next, limit: PAGE_SIZE });
  }, []);

  const querystring = serialiseFilters(filters);
  // Derived, so refining the search re-arms the control without an effect
  // watching for it.
  const alreadySaved = savedSearch === querystring;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {t('title')}
      </h1>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchBar
          value={queryText}
          onChange={setQueryText}
          onSelectCategory={(category) =>
            setFilters((current) => ({ ...current, categorySlug: category.slug, limit: PAGE_SIZE }))
          }
          className="flex-1"
        />
        <div className="flex flex-wrap items-center gap-3">
          <LocationSetter className="min-w-0 flex-1 sm:flex-none" />
          <FilterDrawer filters={filters} onApply={onApplyFilters} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {loading && !result
            ? t('searching')
            : t('resultCount', { count: result?.totalCount ?? 0 })}
        </p>

        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label={t('viewToggleLabel')}
            className="inline-flex rounded-button border border-input p-0.5"
          >
            {(['list', 'map'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  view === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {mode === 'list' ? (
                  <List aria-hidden className="size-4" />
                ) : (
                  <MapIcon aria-hidden className="size-4" />
                )}
                {t(`view.${mode}`)}
              </button>
            ))}
          </div>

          {activeFilterCount(filters) > 0 && (
            <Button variant="ghost" size="sm" onClick={() => onApplyFilters(clearFilters(filters))}>
              {t('clearFilters')}
            </Button>
          )}

          {/* Saving a SEARCH is device-local and ungated: it stores a
              querystring, touches nobody else's data, and a guest refining a
              search is exactly who we want to keep. Saving a WORKER is gated,
              because that writes to an account. */}
          <Button
            variant="ghost"
            size="sm"
            disabled={!querystring || alreadySaved}
            onClick={() => {
              saveSearch(querystring, queryText.trim() || t('untitledSearch'));
              setSavedSearch(querystring);
              toast({ title: t('searchSaved') });
            }}
          >
            {alreadySaved ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
            {t('saveSearch')}
          </Button>
        </div>
      </div>

      {view === 'list' ? (
        <div className="mt-6">
          <WorkerResults
            workers={workers}
            loading={loading && !result}
            error={Boolean(error)}
            noProviders={result?.noProviders}
            hasMore={result?.hasMore ?? false}
            loadingMore={loading && Boolean(result)}
            onRetry={() => void refetch()}
            onLoadMore={() =>
              setFilters((current) => ({ ...current, limit: current.limit + PAGE_SIZE }))
            }
            onClearFilters={() => onApplyFilters(clearFilters(filters))}
            onWidenRadius={(radiusM) =>
              setFilters((current) => ({ ...current, radiusM, limit: PAGE_SIZE }))
            }
          />
        </div>
      ) : (
        <div className="mt-6 lg:grid lg:grid-cols-[1fr_420px] lg:gap-6">
          <WorkerMap
            workers={workers}
            center={
              isValidCoordinate(filters.latitude, filters.longitude)
                ? { latitude: filters.latitude as number, longitude: filters.longitude as number }
                : null
            }
            className="h-105 w-full lg:h-160"
            onSelectWorker={(userId) => router.push(`/app/workers/${userId}`)}
            onSearchArea={(viewport) => {
              // The map reports where the user looked; PostGIS still decides
              // who is there. The radius is derived from the viewport's own
              // span so "this area" means the area on screen.
              const [west, south, east, north] = viewport.bounds;
              const spanDegrees = Math.max(east - west, north - south);
              setFilters((current) => ({
                ...current,
                latitude: viewport.latitude,
                longitude: viewport.longitude,
                // ~111 km per degree of latitude; halved to get a radius from
                // a diameter. Presentation-side sizing of a request, not a
                // spatial measurement — the server clamps it anyway.
                radiusM: Math.round((spanDegrees * 111_000) / 2),
                limit: PAGE_SIZE,
              }));
            }}
          />

          <div className="mt-6 lg:mt-0 lg:max-h-160 lg:overflow-y-auto">
            <WorkerResults
              workers={workers}
              loading={loading && !result}
              error={Boolean(error)}
              noProviders={result?.noProviders}
              onRetry={() => void refetch()}
              onWidenRadius={(radiusM) =>
                setFilters((current) => ({ ...current, radiusM, limit: PAGE_SIZE }))
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
