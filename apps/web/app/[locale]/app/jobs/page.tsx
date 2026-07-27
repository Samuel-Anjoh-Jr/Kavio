import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { JobsBoard } from '@/components/discovery/jobs-board';
import { buildMetadata } from '@/lib/seo';

/**
 * The posted-jobs browse surface is public and crawlable (ACC-01), so it carries
 * a clean canonical and an OG image via buildMetadata — the base path is
 * canonical, and any filter query is stripped so filtered variants don't compete
 * to rank (§26.4).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Jobs' });
  return buildMetadata({
    locale,
    path: '/app/jobs',
    title: t('title'),
    description: t('subtitle'),
  });
}

/**
 * Posted-jobs browse surface. Open to guests (ACC-01). The board renders
 * client-side (`JobsBoard`, `@Public()` on the `jobs` resolver) so this page
 * stays a plain server component for its metadata.
 */
export default async function JobsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Jobs');

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
            {t('title')}
          </h1>
          <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/app/jobs/new">{t('post')}</Link>
        </Button>
      </div>

      <JobsBoard />
    </div>
  );
}
