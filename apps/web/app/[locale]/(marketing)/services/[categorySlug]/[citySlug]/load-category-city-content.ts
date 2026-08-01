import { print } from 'graphql';
import { getApiBaseUrl } from '@/lib/auth-api';
import { SEARCH_WORKERS_QUERY, type SearchWorkersQueryResult } from '@/lib/graphql/discovery';

/** Workers shown on the landing page — enough to prove supply, not a full result page. */
const PREVIEW_LIMIT = 6;

/** Radius around the city centre a "worker in {city}" claim is honest at. */
const CITY_RADIUS_M = 20_000;

export interface CategoryCityContent {
  totalCount: number;
  workers: SearchWorkersQueryResult['searchWorkers']['workers'];
  noProvidersReason: string | null;
}

const EMPTY_CONTENT: CategoryCityContent = { totalCount: 0, workers: [], noProvidersReason: null };

/**
 * Server-side read of the live worker count and a sample for one trade × city
 * combination (competitive-analysis rec §3), on the same public GraphQL read
 * every other search surface uses (DUAL API RULE) — never a fabricated count.
 *
 * Same shape as `loadMarketingContent`: a plain, cookie-free `fetch` (so this
 * stays static/ISR rather than forced dynamic by `auth()`), a hard timeout, and
 * an EMPTY result on any failure rather than a thrown error — a stale or
 * missing preview costs one section of a landing page, not the page itself.
 */
export async function loadCategoryCityContent(options: {
  categorySlug: string;
  latitude: number;
  longitude: number;
}): Promise<CategoryCityContent> {
  try {
    const base = getApiBaseUrl();
    if (!/^https?:\/\//.test(base)) return EMPTY_CONTENT;

    const response = await fetch(`${base}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: print(SEARCH_WORKERS_QUERY),
        variables: {
          categorySlug: options.categorySlug,
          latitude: options.latitude,
          longitude: options.longitude,
          radiusM: CITY_RADIUS_M,
          sort: 'trust',
          limit: PREVIEW_LIMIT,
          offset: 0,
        },
      }),
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 3600 },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = (await response.json()) as {
      data?: SearchWorkersQueryResult;
      errors?: unknown;
    };
    if (json.errors) throw new Error('GraphQL error');

    const result = json.data?.searchWorkers;
    if (!result) return EMPTY_CONTENT;

    return {
      totalCount: result.totalCount,
      workers: result.workers,
      noProvidersReason: result.noProviders?.reason ?? null,
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        scope: 'marketing.category-city',
        msg: 'Category/city preview read failed; rendering empty section',
        code: error instanceof Error ? error.message : 'UNKNOWN',
        timestamp: new Date().toISOString(),
      }),
    );

    return EMPTY_CONTENT;
  }
}
