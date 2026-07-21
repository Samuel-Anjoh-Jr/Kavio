import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Jobs' });
  return { title: t('title'), description: t('subtitle') };
}

/**
 * Posted-jobs browse surface. Open to guests (ACC-01); the job feed itself
 * arrives with the jobs backend in PROMPT 54-57.
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

      <div className="mt-8 rounded-card border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      </div>
    </div>
  );
}
