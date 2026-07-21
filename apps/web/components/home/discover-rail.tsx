'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { LocationSetter } from '@/components/discovery/location-setter';
import { SearchBar } from '@/components/discovery/search-bar';
import { useBrowsingLocation } from '@/components/discovery/location-provider';
import { WorkerCard, WorkerCardSkeleton } from '@/components/discovery/worker-card';
import { searchResultToCard } from '@/lib/discovery';
import { isValidCoordinate } from '@/lib/geo';
import { SEARCH_WORKERS_QUERY, type SearchWorkersQueryResult } from '@/lib/graphql/discovery';
import { EMPTY_FILTERS, serialiseFilters } from '@/lib/search-filters';

/**
 * "Find a worker" for the CLIENT and BUSINESS homes (ACC-07, DIS-01).
 *
 * The same discovery components the guest screen uses, reframed for somebody
 * who already has an account: the copy is about hiring rather than about what
 * the platform is, and the rail is short because a signed-in client came here to
 * do something specific, not to be convinced.
 */
export function DiscoverRail({ limit = 3 }: { limit?: number }) {
  const t = useTranslations('RoleHome');
  const router = useRouter();
  const { location } = useBrowsingLocation();
  const [queryText, setQueryText] = useState('');

  // Derived from the shared location rather than mirrored into state, so a
  // location set in the drawer above is reflected on the next render.
  const origin = useMemo(
    () =>
      location
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            radiusM: location.radiusM,
          }
        : null,
    [location],
  );

  const variables = useMemo(() => {
    const base: Record<string, unknown> = { limit, offset: 0 };
    if (origin && isValidCoordinate(origin.latitude, origin.longitude)) {
      base.latitude = origin.latitude;
      base.longitude = origin.longitude;
      base.radiusM = origin.radiusM;
    }
    return base;
  }, [limit, origin]);

  const { data, loading } = useQuery<SearchWorkersQueryResult>(SEARCH_WORKERS_QUERY, {
    variables,
    fetchPolicy: 'cache-and-network',
  });

  const workers = useMemo(
    () => (data?.searchWorkers.workers ?? []).map(searchResultToCard),
    [data?.searchWorkers.workers],
  );

  function openSearch() {
    const querystring = serialiseFilters({
      ...EMPTY_FILTERS,
      query: queryText.trim() || null,
      latitude: origin?.latitude ?? null,
      longitude: origin?.longitude ?? null,
      radiusM: origin?.radiusM ?? EMPTY_FILTERS.radiusM,
    });
    router.push(querystring ? `/app/search?${querystring}` : '/app/search');
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBar
          value={queryText}
          onChange={setQueryText}
          onSubmit={openSearch}
          placeholder={t('searchPlaceholder')}
          className="flex-1"
        />
        <LocationSetter />
      </div>

      {loading && workers.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: limit }, (_, index) => (
            <WorkerCardSkeleton key={index} />
          ))}
        </div>
      ) : workers.length === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-surface/50 px-6 py-10 text-center text-sm text-muted-foreground">
          {t('noWorkersNearby')}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workers.map((worker) => (
            <WorkerCard key={worker.userId} worker={worker} />
          ))}
        </div>
      )}

      <div>
        <Button variant="outline" onClick={openSearch}>
          {t('browseAll')}
        </Button>
      </div>
    </div>
  );
}
