import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MarketingManager } from '@/components/admin/marketing-manager';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.marketing' });
  // Admin surface — never indexed (SRS §26.4).
  return { title: t('pageTitle'), robots: { index: false, follow: false } };
}

/** Admin-gated by the console layout; authorisation is the API's own guards. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Admin.marketing');

  return (
    <div>
      <h2 className="font-heading text-xl font-semibold text-foreground">{t('pageTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('pageSubtitle')}</p>
      <div className="mt-6">
        <MarketingManager />
      </div>
    </div>
  );
}
