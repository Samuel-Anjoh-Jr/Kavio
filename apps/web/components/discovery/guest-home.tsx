'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Briefcase, List, Map as MapIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { useRequireAuth } from '@/components/auth/require-auth';
import { emptyRecentWorkers, readRecentWorkers, searchResultToCard } from '@/lib/discovery';
import { isValidCoordinate } from '@/lib/geo';
import { SEARCH_WORKERS_QUERY, type SearchWorkersQueryResult } from '@/lib/graphql/discovery';
import { PAGE_SIZE, serialiseFilters, EMPTY_FILTERS } from '@/lib/search-filters';
import { cn } from '@/lib/utils';
import { LocationSetter } from './location-setter';
import { SearchBar } from './search-bar';
import { useBrowsingLocation } from './location-provider';
import { useDebouncedValue } from './use-debounced-value';
import { WorkerMap } from './worker-map';
import { WorkerResults } from './worker-results';

/**
 * The guest first-interface (DIS-01, DIS-02, ACC-01) — the meeting-notes core.
 *
 * Everything the notes asked for on ONE screen: worker profiles, posted jobs,
 * the location setter, the search bar, and Post a Job. A signed-out visitor can
 * genuinely use it — run real searches, browse the map, and open a FULL worker
 * profile — with no account at all.
 *
 * That is the entire strategy of this screen. We are asking people to trust a
 * stranger with their home and their money; the way to earn a sign-up is to
 * show them eleven verified electricians within 3 km of where they are standing
 * FIRST. Every state-changing action (post, apply, contact, save) captures its
 * intent, bounces to auth, and resumes (ACC-02) — the wall is at the action,
 * never at the browsing.
 *
 * An authenticated user never reaches this component: the route redirects them
 * to their role-based home first (PROMPT 53.1).
 */
/** Recently-viewed only changes on another route, so a mount-time read suffices. */
const NO_SUBSCRIBE = () => () => {};

export function GuestHome() {
  const t = useTranslations('Explore');
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const { location } = useBrowsingLocation();

  const [queryText, setQueryText] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');

  /**
   * "Search this area" moves the origin away from the user's chosen location
   * for as long as they are exploring the map. Held as an OVERRIDE rather than
   * copied state, so the chosen location keeps leading by default (CLAUDE.md:
   * "the set location drives feed and search") and setting a new one anywhere in
   * the app is reflected here without a synchronising effect.
   */
  const [areaOverride, setAreaOverride] = useState<{
    latitude: number;
    longitude: number;
    radiusM: number;
  } | null>(null);

  const origin = useMemo(() => {
    if (areaOverride) return areaOverride;
    if (!location) return null;
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      radiusM: location.radiusM,
    };
  }, [areaOverride, location]);

  const debouncedQuery = useDebouncedValue(queryText, 300);

  // Recently viewed is device-local browsing history, so a guest gets it too
  // (DIS-10). localStorage is an external store, read as one.
  const recent = useSyncExternalStore(NO_SUBSCRIBE, readRecentWorkers, emptyRecentWorkers);

  const variables = useMemo(() => {
    const base: Record<string, unknown> = { limit: PAGE_SIZE, offset: 0 };
    if (debouncedQuery.trim()) base.query = debouncedQuery.trim();
    if (categorySlug) base.categorySlug = categorySlug;
    if (origin && isValidCoordinate(origin.latitude, origin.longitude)) {
      base.latitude = origin.latitude;
      base.longitude = origin.longitude;
      base.radiusM = origin.radiusM;
    }
    return base;
  }, [debouncedQuery, categorySlug, origin]);

  const { data, loading, error, refetch } = useQuery<SearchWorkersQueryResult>(
    SEARCH_WORKERS_QUERY,
    { variables, fetchPolicy: 'cache-and-network', notifyOnNetworkStatusChange: true },
  );

  const result = data?.searchWorkers;
  const workers = useMemo(() => (result?.workers ?? []).map(searchResultToCard), [result?.workers]);

  /** Hands the current exploration off to the full search screen, URL and all. */
  function openFullSearch() {
    const querystring = serialiseFilters({
      ...EMPTY_FILTERS,
      query: debouncedQuery.trim() || null,
      categorySlug,
      latitude: origin?.latitude ?? null,
      longitude: origin?.longitude ?? null,
      radiusM: origin?.radiusM ?? EMPTY_FILTERS.radiusM,
    });
    router.push(querystring ? `/app/search?${querystring}` : '/app/search');
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <section aria-labelledby="explore-heading">
        <h1
          id="explore-heading"
          className="max-w-2xl font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
        >
          {t('title')}
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('subtitle')}</p>

        {/* (c) location setter · (d) search bar · (e) post-job button */}
        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchBar
            value={queryText}
            onChange={setQueryText}
            onSelectCategory={(category) => setCategorySlug(category.slug)}
            onSubmit={openFullSearch}
            className="flex-1"
          />

          <div className="flex flex-wrap items-center gap-3">
            <LocationSetter className="min-w-0 flex-1 sm:flex-none" />

            {/* Posting is a state-changing action: the intent is captured and
                replayed after sign-in, so the job the guest had in mind is not
                lost to the detour (ACC-02). */}
            <Button
              size="lg"
              onClick={() =>
                requireAuth('post_job', () => router.push('/app/jobs/new'), {
                  returnTo: '/app/jobs/new',
                })
              }
            >
              <Plus aria-hidden />
              {t('postJob')}
            </Button>
          </div>
        </div>
      </section>

      {/* (a) worker profiles — with the map/list split */}
      <section aria-labelledby="workers-heading" className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="workers-heading" className="font-heading text-xl font-semibold text-foreground">
            {t('workersHeading')}
          </h2>

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

            <Button variant="ghost" size="sm" onClick={openFullSearch}>
              {t('seeAll')}
              <ArrowRight aria-hidden />
            </Button>
          </div>
        </div>

        <div
          className={cn(
            'mt-6',
            // Side by side from lg; on a phone the toggle above decides, because
            // a half-height map next to a half-height list is two unusable panes.
            view === 'map' ? 'lg:grid lg:grid-cols-[1fr_420px] lg:gap-6' : '',
          )}
        >
          {view === 'map' && (
            <WorkerMap
              workers={workers}
              center={origin}
              className="h-[420px] w-full lg:h-[640px]"
              onSelectWorker={(userId) => router.push(`/app/workers/${userId}`)}
              onSearchArea={(viewport) => {
                // The map reports where the user looked; PostGIS still decides
                // who is there. The radius is derived from the viewport's own
                // span so "this area" means the area on screen.
                const [west, south, east, north] = viewport.bounds;
                const spanDegrees = Math.max(east - west, north - south);
                setAreaOverride({
                  latitude: viewport.latitude,
                  longitude: viewport.longitude,
                  // ~111 km per degree of latitude; halved to get a radius from
                  // a diameter. Presentation-side sizing of a request, not a
                  // spatial measurement — the server clamps it anyway.
                  radiusM: Math.round((spanDegrees * 111_000) / 2),
                });
              }}
            />
          )}

          <div className={view === 'map' ? 'mt-6 lg:mt-0 lg:max-h-[640px] lg:overflow-y-auto' : ''}>
            <WorkerResults
              workers={workers}
              loading={loading && !result}
              error={Boolean(error)}
              noProviders={result?.noProviders}
              onRetry={() => void refetch()}
              onWidenRadius={(radiusM) => setAreaOverride(origin ? { ...origin, radiusM } : null)}
            />
          </div>
        </div>
      </section>

      {/* (b) posted jobs */}
      <section aria-labelledby="jobs-heading" className="mt-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="jobs-heading" className="font-heading text-xl font-semibold text-foreground">
            {t('jobsHeading')}
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/app/jobs">
              {t('seeAll')}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>

        {/* The jobs module is Phase 4 (PROMPTS 54-57). Until it exists this
            section says so rather than rendering invented job cards — a
            marketplace that fakes its supply is exactly what this product is
            positioned against. */}
        <div className="mt-6 flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface/50 px-6 py-14 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-muted">
            <Briefcase aria-hidden className="size-8 text-muted-foreground" />
          </span>
          <p className="max-w-md text-sm text-muted-foreground">{t('jobsEmpty')}</p>
          <Button
            variant="outline"
            onClick={() =>
              requireAuth('post_job', () => router.push('/app/jobs/new'), {
                returnTo: '/app/jobs/new',
              })
            }
          >
            <Plus aria-hidden />
            {t('postJob')}
          </Button>
        </div>
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="mt-14">
          <h2 id="recent-heading" className="font-heading text-xl font-semibold text-foreground">
            {t('recentlyViewed')}
          </h2>
          <ul className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {recent.map((worker) => (
              <li key={worker.userId} className="w-56 shrink-0">
                <Link
                  href={`/app/workers/${worker.userId}`}
                  className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="truncate font-medium text-foreground">
                    {worker.name ?? t('unnamedWorker')}
                  </span>
                  {worker.headline && (
                    <span className="truncate text-xs text-muted-foreground">
                      {worker.headline}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
