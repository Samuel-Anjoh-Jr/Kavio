import type { Metadata } from 'next';
import { routing, type Locale } from '@/i18n/routing';

/**
 * SEO hygiene helpers (SRS §26.4; PROMPTS 93, 93.1).
 *
 * TWO RULES, both enforced here rather than left to each page:
 *
 *   1. CANONICALS ARE SERVER-DERIVED AND STRIPPED OF QUERY PARAMS. Never from
 *      `window.location` — that runs after hydration, is invisible to the
 *      crawler that mattered, and on a filtered discovery URL it would declare
 *      every filter combination its own canonical page. `canonicalFor` takes a
 *      PATH and cannot express a query string; that is the enforcement.
 *   2. NOINDEX BY DEFAULT for paginated variants beyond page 1, filtered
 *      discovery, search results, and account/auth/preview routes. `robotsFor`
 *      decides from the path so a new route inherits the rule instead of having
 *      to remember it.
 */

/**
 * The public origin. Set NEXT_PUBLIC_SITE_URL per environment; the localhost
 * fallback is for local dev only and would produce useless canonicals in
 * production — which the metadata integrity check flags.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);

/** Locale-prefixed absolute URL for a path. Query strings are not representable. */
export function canonicalFor(locale: string, path = '/'): string {
  const clean = path.split('?')[0]!.split('#')[0]!;
  const normalised = clean === '/' ? '' : `/${clean.replace(/^\/|\/$/g, '')}`;
  return `${SITE_URL}/${locale}${normalised}`;
}

/**
 * `hreflang` alternates for a path, plus `x-default`.
 *
 * A bilingual site without these competes against itself: Google treats the EN
 * and FR pages as duplicates and picks one, so half the audience is served the
 * wrong language from search.
 */
export function alternatesFor(path = '/'): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = canonicalFor(locale, path);
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

export function robotsFor(path: string, context: RobotsContext = {}): Metadata['robots'] {
  if (!shouldNoindex(path, context)) {
    return { index: true, follow: true };
  }

  // `follow` stays TRUE while `index` is false: a filtered discovery page should
  // not rank, but the worker profiles it links to absolutely should be
  // discovered through it. `nofollow` here would wall off the crawlable content.
  return { index: false, follow: true };
}

/**
 * The one place page metadata is assembled, so every public route ends up with
 * a title, a description, a canonical and an OG image — the four things the
 * route-metadata integrity check asserts (SRS §26.4).
 */
export function buildMetadata(options: {
  locale: Locale | string;
  /** Path WITHOUT the locale prefix, e.g. `/legal/terms`. */
  path: string;
  title: string;
  description: string;
  /** Overrides the generated OG image. */
  image?: string;
  robots?: RobotsContext;
  type?: 'website' | 'article' | 'profile';
}): Metadata {
  const { locale, path, title, description, image, robots, type = 'website' } = options;
  const canonical = canonicalFor(locale, path);
  const ogImage = image ?? `${SITE_URL}/${locale}/opengraph-image`;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical, languages: alternatesFor(path) },
    robots: robotsFor(path, robots),
    openGraph: {
      type,
      url: canonical,
      title,
      description,
      siteName: 'TrustPro',
      locale: locale === 'fr' ? 'fr_CM' : 'en_CM',
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}
