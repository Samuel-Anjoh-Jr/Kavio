import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RiskMonitor } from '@/components/admin/risk-monitor';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin' });
  return { title: t('riskTitle'), robots: { index: false } };
}

/** Admin-gated by the console layout; authorisation is the API's own guards. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Admin');

  return (
    <div>
      <h2 className="font-heading text-xl font-semibold text-foreground">{t('riskTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('riskSubtitle')}</p>
      <div className="mt-6">
        <RiskMonitor />
      </div>
    </div>
  );
}
