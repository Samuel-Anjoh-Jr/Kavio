import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ExploreActions } from './explore-actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Explore' });
  return { title: t('title'), description: t('subtitle') };
}

/**
 * The guest exploration surface (ACC-01).
 *
 * Reachable with NO account. The worker/job feeds it frames are Phase 3 work
 * (search backend P44, worker profiles P46, the full first-interface P53), so
 * this screen ships the parts that do not depend on them — the search entry
 * point, the gated post-job action, and honest empty states — rather than
 * fabricating placeholder workers that would misrepresent the platform.
 */
export default async function ExplorePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Explore');

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchLabel')}
            className="pl-11"
          />
        </div>
        <ExploreActions />
      </div>

      <section aria-labelledby="workers-heading" className="mt-12">
        <h2 id="workers-heading" className="font-heading text-xl font-semibold text-foreground">
          {t('workersHeading')}
        </h2>
        <EmptyState message={t('workersEmpty')} />
      </section>

      <section aria-labelledby="jobs-heading" className="mt-12">
        <h2 id="jobs-heading" className="font-heading text-xl font-semibold text-foreground">
          {t('jobsHeading')}
        </h2>
        <EmptyState message={t('jobsEmpty')} />
      </section>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-card border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
