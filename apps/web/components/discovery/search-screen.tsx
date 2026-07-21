'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { Bookmark, BookmarkCheck } from 'lucide-react';
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
import { FilterDrawer } from './filter-drawer';
import { LocationSetter } from './location-setter';
import { SearchBar } from './search-bar';
import { useBrowsingLocation } from './location-provider';
import { useDebouncedValue } from './use-debounced-value';
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

  const variables = useMemo(() => toSearchVariables(filters), [filters]);

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
    </div>
  );
}
