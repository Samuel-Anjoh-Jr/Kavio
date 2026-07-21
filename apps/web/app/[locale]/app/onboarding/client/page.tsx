import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { loadOnboarding } from '../load-onboarding';
import { ClientOnboarding } from './client-onboarding';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Onboarding.client' });
  return { title: t('title'), robots: { index: false } };
}

export default async function ClientOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const initial = await loadOnboarding('CLIENT');

  if (!initial) {
    redirect({ href: '/app/home', locale });
    return null;
  }

  return <ClientOnboarding initial={initial} />;
}
