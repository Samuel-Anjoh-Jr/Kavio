import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { JsonLd } from '@/components/seo/json-ld';
import { buildMetadata, canonicalFor } from '@/lib/seo';
import {
  SEO_LANDING_BUILD_CITY_SLUGS,
  SERVICE_TRADES,
  findServiceAreaBySlug,
  findServiceTradeBySlug,
} from '@/lib/site-config';
import { breadcrumbNode, graph, serviceNode, webPageNode } from '@/lib/structured-data';
import { loadCategoryCityContent } from './load-category-city-content';
import { WorkerPreviewGrid } from './worker-preview-grid';

/**
 * Programmatic trade × city landing pages (competitive-analysis rec §3).
 *
 * Cameroon's existing job boards (Kamerjob, JobInfoCamer, Emploi.cm) have years
 * of indexed pages for exactly this query shape — "agent de sécurité Yaoundé".
 * Kavio's Trust Engine and PostGIS proximity search already leapfrog them on
 * product; the gap is discoverability, so this page competes on the same
 * query with REAL content: a live worker count and real profiles for this
 * trade in this city, never placeholder copy.
 *
 * Pre-rendered at build time for every trade across `SEO_LANDING_BUILD_CITY_SLUGS`
 * (SYS-05: public pages static/ISR). Every other city still resolves — Next's
 * default `dynamicParams` stays true — and is ISR-cached on first request, so
 * the full trade × city grid becomes real pages without a 288-page build.
 *
 * Lives under `(marketing)/`, so it automatically inherits that group's
 * exclusion from the installable-app service worker (see the layout's own
 * comment) — a fast, crawlable page, not part of the PWA shell.
 */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    SERVICE_TRADES.flatMap((trade) =>
      SEO_LANDING_BUILD_CITY_SLUGS.map((citySlug) => ({
        locale,
        categorySlug: trade.slug,
        citySlug,
      })),
    ),
  );
}

/** Same hourly cadence as the landing page — the worker count and preview are live data. */
export const revalidate = 3600;

interface RouteParams {
  locale: string;
  categorySlug: string;
  citySlug: string;
}

/** Null for any slug pair that is not a real trade × city combination. */
function resolveRoute(params: RouteParams) {
  const trade = findServiceTradeBySlug(params.categorySlug);
  const city = findServiceAreaBySlug(params.citySlug);
  return trade && city ? { trade, city } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const routeParams = await params;
  const resolved = resolveRoute(routeParams);
  if (!resolved) return {};

  const { locale, categorySlug, citySlug } = routeParams;
  const { trade, city } = resolved;
  const tradeName = locale === 'fr' ? trade.nameFr : trade.nameEn;
  const t = await getTranslations({ locale, namespace: 'ServiceCityLanding' });

  return buildMetadata({
    locale,
    path: `/services/${categorySlug}/${citySlug}`,
    title: t('meta.title', { trade: tradeName, city: city.name }),
    description: t('meta.description', { trade: tradeName, city: city.name }),
  });
}

export default async function ServiceCityLandingPage({ params }: { params: Promise<RouteParams> }) {
  const routeParams = await params;
  const resolved = resolveRoute(routeParams);
  if (!resolved) notFound();

  const { locale, categorySlug, citySlug } = routeParams;
  setRequestLocale(locale);
  const { trade, city } = resolved;
  const tradeName = locale === 'fr' ? trade.nameFr : trade.nameEn;

  const t = await getTranslations('ServiceCityLanding');
  const tHome = await getTranslations('Breadcrumbs');

  const content = await loadCategoryCityContent({
    categorySlug,
    latitude: city.latitude,
    longitude: city.longitude,
  });

  const path = `/services/${categorySlug}/${citySlug}`;
  const url = canonicalFor(locale, path);
  const title = t('title', { trade: tradeName, city: city.name });
  const description = t('meta.description', { trade: tradeName, city: city.name });

  const structuredData = graph([
    webPageNode({ locale, url, title, description, breadcrumbId: `${url}#breadcrumb` }),
    breadcrumbNode({
      locale,
      url,
      items: [
        { name: tHome('home'), path: '/' },
        { name: title, path },
      ],
    }),
    serviceNode({ locale, name: title, description, categories: [tradeName] }),
  ]);

  const searchHref = `/app/search?cat=${categorySlug}&lat=${city.latitude}&lng=${city.longitude}`;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-16 sm:px-6">
      <JsonLd data={structuredData} />

      <header className="flex flex-col gap-4">
        <nav aria-label={tHome('home')} className="text-sm text-muted-foreground">
          <Link href="/" className="hover:underline">
            {tHome('home')}
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{title}</span>
        </nav>

        <h1 className="text-balance font-heading text-3xl font-semibold text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="max-w-2xl text-balance text-muted-foreground">
          {t('intro', { trade: tradeName, city: city.name })}
        </p>

        {/* A live number or an honest "not yet" — never a placeholder count. */}
        {content.totalCount > 0 ? (
          <p className="font-numeric text-lg font-semibold text-primary">
            {t('liveCount', { count: content.totalCount, trade: tradeName, city: city.name })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('noProvidersYet', { trade: tradeName, city: city.name })}
          </p>
        )}

        <div>
          <Button asChild variant="accent" size="lg">
            <Link href={searchHref}>{t('cta', { trade: tradeName, city: city.name })}</Link>
          </Button>
        </div>
      </header>

      {content.workers.length > 0 && (
        <section aria-labelledby="workers-heading" className="flex flex-col gap-6">
          <h2 id="workers-heading" className="font-heading text-2xl font-semibold text-foreground">
            {t('workersHeading', { trade: tradeName, city: city.name })}
          </h2>
          <WorkerPreviewGrid workers={content.workers} />
        </section>
      )}

      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="font-heading text-xl font-semibold text-foreground">{t('trustHeading')}</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('trustBody')}</p>
        <Button
          asChild
          variant="ghost"
          className="mt-3 w-fit px-0 text-primary hover:bg-transparent hover:underline"
        >
          <Link href="/app/trust">{t('trustLink')}</Link>
        </Button>
      </section>
    </div>
  );
}
