import type { Metadata } from 'next';
import { routing, type Locale } from '@/i18n/routing';
import {
  COUNTRY,
  OG_LOCALES,
  SERVICE_AREAS,
  SITE_URL,
  localeTag,
  ogImageUrl,
  twitterHandle,
  verificationTokens,
} from '@/lib/site-config';

/**
 * SEO assembly (SRS §26.4; PROMPTS 93, 93.1).
 *
 * THREE jobs, all enforced here rather than left to each page:
 *
 *   1. CANONICALS ARE SERVER-DERIVED AND STRIPPED OF QUERY PARAMS. Never from
 *      `window.location` — that runs after hydration, is invisible to the
 *      crawler, and on a filtered URL would declare every filter its own page.
 *      `canonicalFor` takes a PATH and cannot express a query string.
 *   2. NOINDEX BY DEFAULT for paginated variants beyond page 1, filtered
 *      discovery, search results, and account/auth/preview routes.
 *   3. FULL EN/FR PARITY plus the rich directives that decide whether a page is
 *      merely indexed or is eligible to be QUOTED — by a rich result, and by an
 *      AI answer engine. `max-snippet:-1` + `max-image-preview:large` are the
 *      difference between "ranked" and "cited"; withholding them is the most
 *      common way a technically-fine page stays invisible in AI Overviews.
 */

export { SITE_URL };

/** Locale-prefixed absolute URL for a path. Query strings are not representable. */
export function canonicalFor(locale: string, path = '/'): string {
  const clean = path.split('?')[0]!.split('#')[0]!;
  const normalised = clean === '/' ? '' : `/${clean.replace(/^\/|\/$/g, '')}`;
  return `${SITE_URL}/${locale}${normalised}`;
}

/**
 * `hreflang` alternates for a path, keyed by REGION-QUALIFIED tag (en-CM / fr-CM)
 * plus `x-default`.
 *
 * A bilingual site without these competes against itself: Google treats the EN
 * and FR pages as duplicates and picks one, so half the audience is served the
 * wrong language from search. The region qualifier (…-CM) is deliberate — it
 * tells search engines these pages target Cameroon specifically, which is the
 * whole game for local intent like "électricien Douala".
 */
export function alternatesFor(path = '/'): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[localeTag(locale)] = canonicalFor(locale, path);
  }
  languages['x-default'] = canonicalFor(routing.defaultLocale, path);
  return languages;
}

/** Path prefixes (locale already stripped) that must never be indexed. */
const NOINDEX_PREFIXES = [
  '/auth',
  '/app/settings',
  '/app/wallet',
  '/app/messages',
  '/app/notifications',
  '/app/admin',
  '/app/onboarding',
  '/app/verification',
  '/app/disputes',
  '/app/quotes',
  '/app/safety',
  '/app/review',
  '/app/trust',
  '/app/business',
  '/search',
  '/preview',
  '/maintenance',
];

export interface RobotsContext {
  /** Pagination position. Anything beyond 1 is noindex. */
  page?: number;
  /** True when discovery filters are applied — a filtered catalogue URL. */
  filtered?: boolean;
  /** True for a search-results render. */
  search?: boolean;
}

export function shouldNoindex(path: string, context: RobotsContext = {}): boolean {
  if (context.search || context.filtered) return true;
  if ((context.page ?? 1) > 1) return true;

  const clean = `/${path.replace(/^\//, '')}`.replace(/\/$/, '') || '/';
  return NOINDEX_PREFIXES.some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`));
}

/**
 * The rich directives granted to an INDEXABLE page. `max-snippet:-1` lets an
 * answer engine quote the whole relevant passage; `max-image-preview:large`
 * lets it show the OG image; `max-video-preview:-1` covers any future video.
 * Together they are what make a page eligible to be surfaced in full rather than
 * as a bare blue link — the single highest-leverage robots setting for the
 * AI-answer era.
 */
const RICH_PREVIEW = {
  'max-snippet': -1,
  'max-image-preview': 'large',
  'max-video-preview': -1,
} as const;

export function robotsFor(path: string, context: RobotsContext = {}): Metadata['robots'] {
  if (!shouldNoindex(path, context)) {
    return {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, ...RICH_PREVIEW },
    };
  }

  // `follow` stays TRUE while `index` is false: a filtered discovery page should
  // not rank, but the worker profiles it links to absolutely should be
  // discovered through it. `nofollow` here would wall off the crawlable content.
  return { index: false, follow: true, googleBot: { index: false, follow: true } };
}

/** Legacy geo meta tags for the served market. Still parsed; cheap; harmless. */
function geoMeta(): Record<string, string> {
  return {
    'geo.region': COUNTRY.code,
    'geo.placename': SERVICE_AREAS.map((a) => a.name).join(', '),
    ICBM: `${SERVICE_AREAS[0].latitude}, ${SERVICE_AREAS[0].longitude}`,
  };
}

/**
 * The one place page metadata is assembled, so every public route ends up with a
 * title, a description, a canonical and an OG image — the four the integrity
 * check asserts (SRS §26.4) — plus the parity and rich-preview signals that make
 * it competitive.
 */
export function buildMetadata(options: {
  locale: Locale | string;
  /** Path WITHOUT the locale prefix, e.g. `/legal/terms`. */
  path: string;
  title: string;
  description: string;
  /** Comma-joined or array; deduped. Low direct weight, still read by some engines and AI. */
  keywords?: string | string[];
  /** Overrides the generated OG image. */
  image?: string;
  robots?: RobotsContext;
  type?: 'website' | 'article' | 'profile';
  /** Adds article freshness signals when provided. */
  publishedTime?: string;
  modifiedTime?: string;
}): Metadata {
  const {
    locale,
    path,
    title,
    description,
    keywords,
    image,
    robots,
    type = 'website',
    publishedTime,
    modifiedTime,
  } = options;

  const canonical = canonicalFor(locale, path);
  const ogImage = image ?? ogImageUrl(locale);
  const handle = twitterHandle();

  // og:locale:alternate — names the OTHER language's version so a share on a
  // French timeline resolves to the French card. This is the OpenGraph half of
  // the hreflang parity; without it the two locales share one social identity.
  const alternateLocales = routing.locales
    .filter((l) => l !== locale)
    .map((l) => OG_LOCALES[l] ?? l);

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical, languages: alternatesFor(path) },
    robots: robotsFor(path, robots),
    other: geoMeta(),
    openGraph: {
      type,
      url: canonical,
      title,
      description,
      siteName: 'Kavio',
      locale: OG_LOCALES[locale as string] ?? 'en_CM',
      alternateLocale: alternateLocales,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      ...(type === 'article' && (publishedTime || modifiedTime)
        ? { publishedTime, modifiedTime }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
      ...(handle ? { site: handle, creator: handle } : {}),
    },
    ...(Object.keys(verificationTokens()).length > 0 ? { verification: verificationTokens() } : {}),
  };
}
