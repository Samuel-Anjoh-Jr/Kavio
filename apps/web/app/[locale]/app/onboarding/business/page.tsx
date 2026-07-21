import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { loadOnboarding } from '../load-onboarding';
import { BusinessOnboarding } from './business-onboarding';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Onboarding.business' });
  return { title: t('title'), robots: { index: false } };
}

export default async function BusinessOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const initial = await loadOnboarding('BUSINESS');

  if (!initial) {
    redirect({ href: '/app/home', locale });
    return null;
  }

  return <BusinessOnboarding initial={initial} />;
}
