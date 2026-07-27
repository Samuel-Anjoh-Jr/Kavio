'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Briefcase, List, Map as MapIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { useRequireAuth } from '@/components/auth/require-auth';
import { emptyRecentWorkers, readRecentWorkers, searchResultToCard } from '@/lib/discovery';
import type { WorkerCardData } from '@/lib/discovery';
import { isValidCoordinate } from '@/lib/geo';
import { SEARCH_WORKERS_QUERY, type SearchWorkersQueryResult } from '@/lib/graphql/discovery';
import { JOBS_QUERY, type JobsQueryResult } from '@/lib/graphql/jobs';
import { PAGE_SIZE, serialiseFilters, EMPTY_FILTERS } from '@/lib/search-filters';
import { cn } from '@/lib/utils';
import { JobCard, JobCardSkeleton } from './job-card';
import { LocationSetter } from './location-setter';
import { SearchBar } from './search-bar';
import { useBrowsingLocation } from './location-provider';
import { useDebouncedValue } from './use-debounced-value';
import { WorkerCard, WorkerCardSkeleton } from './worker-card';
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

  // The public job board (JOB-04) — a teaser rail, not the full filtered
  // board that /app/jobs offers, so it asks for a flat recent page only.
  const { data: jobsData, loading: jobsLoading } = useQuery<JobsQueryResult>(JOBS_QUERY, {
    variables: { pageSize: 8 },
  });
  const jobs = jobsData?.jobs.jobs ?? [];

  /**
   * Hands the current exploration off to the full search screen, URL and all.
   * A real href (not a router.push in an onClick) so the "see all" control is a
   * genuine link: cursor shows a pointer, and middle-click / right-click-open-in-
   * new-tab work like any other link. The search bar's Enter-to-submit still
   * navigates imperatively via router.push using this same href.
   */
  const fullSearchHref = useMemo(() => {
    const querystring = serialiseFilters({
      ...EMPTY_FILTERS,
      query: debouncedQuery.trim() || null,
      categorySlug,
      latitude: origin?.latitude ?? null,
      longitude: origin?.longitude ?? null,
      radiusM: origin?.radiusM ?? EMPTY_FILTERS.radiusM,
    });
    return querystring ? `/app/search?${querystring}` : '/app/search';
  }, [debouncedQuery, categorySlug, origin]);

  function openFullSearch() {
    router.push(fullSearchHref);
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

            <Button variant="ghost" size="sm" asChild>
              <Link href={fullSearchHref}>
                {t('seeAll')}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        {view === 'list' ? (
          // A horizontal rail rather than a grid: this is a teaser, not the
          // full search screen ("See all" is one tap away), so it should read
          // above the fold next to the hero and the jobs rail below it,
          // instead of pushing both off-screen on a phone.
          <div className="mt-6">
            <WorkersRail
              workers={workers}
              loading={loading && !result}
              error={Boolean(error)}
              onRetry={() => void refetch()}
            />
          </div>
        ) : (
          <div className="mt-6 lg:grid lg:grid-cols-[1fr_420px] lg:gap-6">
            <WorkerMap
              workers={workers}
              center={origin}
              className="h-105 w-full lg:h-160"
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

            <div className="mt-6 lg:mt-0 lg:max-h-160 lg:overflow-y-auto">
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
        )}
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

        {jobs.length === 0 && !jobsLoading ? (
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
        ) : (
          // Capped height rather than an open-ended list: this is a teaser
          // ("See all" routes to the full board at /app/jobs), so it reads as
          // "here's the start of a list, scroll for more" and stays visible
          // above the fold alongside the hero and the workers rail.
          <div className="mt-6 max-h-105 overflow-y-auto pb-1">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {jobsLoading && jobs.length === 0
                ? Array.from({ length: 4 }, (_, index) => <JobCardSkeleton key={index} />)
                : jobs.map((job) => <JobCard key={job.id} job={job} />)}
            </div>
          </div>
        )}
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

/**
 * The horizontal "Workers near you" teaser (DIS-02, DIS-10) shown in the
 * guest page's default list mode. Not `WorkerResults`: that component is a
 * paginated, virtualised grid for the full search screen — this is a fixed
 * handful of cards meant to be scanned in one horizontal swipe, so the
 * hero, search bar and the jobs rail below it all stay reachable without a
 * page scroll.
 */
function WorkersRail({
  workers,
  loading,
  error,
  onRetry,
}: {
  workers: WorkerCardData[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations('Explore');
  const tSearch = useTranslations('Search');

  if (loading && workers.length === 0) {
    return (
      <ul className="flex gap-4 overflow-x-auto pb-2">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="w-72 shrink-0">
            <WorkerCardSkeleton />
          </li>
        ))}
      </ul>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface/50 px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">{tSearch('errorBody')}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          {tSearch('retry')}
        </Button>
      </div>
    );
  }

  if (workers.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border bg-surface/50 px-6 py-10 text-center text-sm text-muted-foreground">
        {t('workersEmpty')}
      </p>
    );
  }

  return (
    <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
      {workers.map((worker) => (
        <li key={worker.userId} className="w-72 shrink-0 snap-start">
          <WorkerCard worker={worker} />
        </li>
      ))}
    </ul>
  );
}
