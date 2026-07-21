import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SearchScreen } from '@/components/discovery/search-screen';
import { parseFilters } from '@/lib/search-filters';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Search' });

  return {
    title: t('title'),
    description: t('metaDescription'),
    // A filtered result page is per-visitor and endlessly parameterised; the
    // crawlable surface is the marketing site and the profiles themselves.
    robots: { index: false },
  };
}

/**
 * Worker search (DIS-03…DIS-08, DIS-11).
 *
 * Open to guests: searching is the first thing a visitor does and the whole
 * argument for signing up (ACC-01). The filters are parsed from the URL HERE, on
 * the server, so the client mounts already showing the shared search rather than
 * flashing an unfiltered list first.
 */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SearchScreen initialFilters={parseFilters(await searchParams)} />;
}
