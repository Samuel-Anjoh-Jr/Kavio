import { print } from 'graphql';
import { getApiBaseUrl } from '@/lib/auth-api';
import { MARKETING_CONTENT_QUERY, type MarketingContentQueryResult } from '@/lib/graphql/marketing';

/**
 * Server-side read of the landing page's FAQ and testimonials (GraphQL, per the
 * DUAL API RULE).
 *
 * Deliberately a plain `fetch`, NOT the shared `getClient()`. That client calls
 * `auth()` to attach a bearer token, and `auth()` reads cookies — which would
 * force the landing page into dynamic rendering and break SYS-05 ("public pages
 * shall be static or ISR"). This content is public and needs no identity, so the
 * request carries no cookies and is cached with ISR via `next.revalidate`,
 * keeping the page static and letting an admin edit show up within the window.
 *
 * A failure returns EMPTY LISTS rather than throwing — the opposite of the rule
 * on a worker profile, where a failed read must never render a synthetic score.
 * The difference is what the content is: an unreachable FAQ costs two sections,
 * whereas a landing page that 500s over its testimonials costs the entire
 * conversion surface. The sections render a branded empty state (SYS-04).
 */
export async function loadMarketingContent(): Promise<MarketingContentQueryResult> {
  try {
    const base = getApiBaseUrl();

    // The base must be absolute for a server-side fetch. During a build with no
    // API configured it can be empty or relative, and fetching that either
    // throws or — worse — hangs until a connection timeout, which can fail static
    // generation. Bail to empty content instead; ISR fills it in at runtime once
    // the API is reachable (§26.3: builds survive an unavailable backend).
    if (!/^https?:\/\//.test(base)) {
      return { faqs: [], testimonials: [] };
    }

    const response = await fetch(`${base}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: print(MARKETING_CONTENT_QUERY) }),
      // A hard ceiling so neither the build nor a slow runtime request ever
      // blocks the page on this — the content is an enhancement, not a gate.
      signal: AbortSignal.timeout(3000),
      // ISR: revalidated on the same hourly cadence as the page itself, so the
      // static HTML and its data never disagree about how fresh they are.
      next: { revalidate: 3600 },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = (await response.json()) as {
      data?: MarketingContentQueryResult;
      errors?: unknown;
    };
    if (json.errors) throw new Error('GraphQL error');

    return { faqs: json.data?.faqs ?? [], testimonials: json.data?.testimonials ?? [] };
  } catch (error) {
    // console rather than lib/logger: that module is 'use client', and importing
    // it here would drag this server-only file across the boundary.
    console.error(
      JSON.stringify({
        level: 'error',
        scope: 'marketing.content',
        msg: 'Marketing content read failed; rendering empty sections',
        code: error instanceof Error ? error.message : 'UNKNOWN',
        timestamp: new Date().toISOString(),
      }),
    );

    return { faqs: [], testimonials: [] };
  }
}
