import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * robots.txt (SYS-05, SRS §26.4).
 *
 * The disallow list is the crawl half of the noindex-by-default rule — meta
 * `robots` on the pages themselves is the other half, and both are needed: meta
 * tags keep a fetched page out of the index, robots.txt keeps the crawler from
 * spending a small site's crawl budget on private and infinite surfaces in the
 * first place.
 *
 * The APP SHELL is disallowed wholesale. It is the authenticated product, its
 * screens render behind a session, and nothing under it is a landing surface —
 * discovery is crawled through the marketing site and the individual worker/job
 * detail pages, which sit outside these prefixes. Auth, search-results and
 * filtered/preview URLs are disallowed for the reasons §26.4 names: duplicate,
 * private, or effectively infinite.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/*/auth/',
          '/*/app/settings/',
          '/*/app/wallet/',
          '/*/app/messages/',
          '/*/app/notifications/',
          '/*/app/admin/',
          '/*/app/onboarding/',
          '/*/app/verification/',
          '/*/app/disputes/',
          '/*/app/quotes/',
          '/*/app/safety/',
          '/*/app/business/',
          '/*/maintenance',
          // Query-bearing crawls: filtered discovery and search results are
          // duplicate or infinite variants of the clean pages (§26.4).
          '/*?*',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
