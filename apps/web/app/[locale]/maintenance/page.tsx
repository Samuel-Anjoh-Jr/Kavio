import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Wrench } from 'lucide-react';
import { SystemState } from '@/components/system/system-state';
import { routing } from '@/i18n/routing';

/**
 * Planned-downtime screen (SYS-04). Reached only by a rewrite from `proxy.ts`
 * when MAINTENANCE_MODE is on — never linked, and it stays reachable directly so
 * an operator can preview the copy before flipping the flag.
 *
 * `noindex` is not optional here: a crawl that happens to land during a
 * maintenance window must not cache this as the site's content.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'SystemStates.maintenance' });

  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false },
  };
}

export default async function MaintenancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('SystemStates.maintenance');

  return (
    <SystemState
      tone="warning"
      icon={<Wrench aria-hidden="true" />}
      title={t('title')}
      description={t('description')}
    />
  );
}
