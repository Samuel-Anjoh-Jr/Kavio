import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { canonicalFor, alternatesFor } from '@/lib/seo';

/**
 * sitemap.xml (SYS-05).
 *
 * Lists the PUBLIC, indexable, crawlable surfaces only — the marketing landing,
 * the guest-browsable discovery entry points, and the legal pages. It pointedly
 * does NOT enumerate worker or job detail pages: those are database-driven and
 * unbounded, and a build-time sitemap that tried to include them would either
 * go stale the moment a worker signs up or force a database read into the build
 * (§26.3 warns against exactly that fragility). Those pages are discovered
 * through the discovery surfaces linked here.
 *
 * Every entry carries `alternates.languages`, so a crawler is told the EN and FR
 * URLs are the same page in two languages rather than duplicates competing to
 * rank.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const routes: { path: string; priority: number; frequency: 'daily' | 'weekly' | 'monthly' }[] = [
    { path: '/', priority: 1, frequency: 'daily' },
    { path: '/app/explore', priority: 0.9, frequency: 'daily' },
    { path: '/app/jobs', priority: 0.8, frequency: 'daily' },
    { path: '/legal/terms', priority: 0.3, frequency: 'monthly' },
    { path: '/legal/privacy', priority: 0.3, frequency: 'monthly' },
    { path: '/legal/refunds', priority: 0.3, frequency: 'monthly' },
  ];

  return routes.flatMap((route) =>
    routing.locales.map((locale) => ({
      url: canonicalFor(locale, route.path),
      lastModified: now,
      changeFrequency: route.frequency,
      priority: route.priority,
      alternates: { languages: alternatesFor(route.path) },
    })),
  );
}
