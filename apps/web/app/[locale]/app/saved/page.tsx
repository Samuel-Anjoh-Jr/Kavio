import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SavedWorkersScreen } from '@/components/discovery/saved-workers-screen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'SavedWorkers' });
  return { title: t('title'), robots: { index: false } };
}

/** The Saved list (DIS-02). Personal to the signed-in user. */
export default async function SavedWorkersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SavedWorkersScreen />;
}
