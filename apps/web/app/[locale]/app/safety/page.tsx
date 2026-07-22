import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SafetyCenterScreen } from '@/components/safety/safety-center-screen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Safety' });
  return { title: t('title'), robots: { index: false } };
}

/**
 * The Safety Center (SOS-01, SOS-02, SOS-03): SOS control, emergency contacts,
 * and SOS history. Personal to the signed-in user.
 */
export default async function SafetyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SafetyCenterScreen />;
}
