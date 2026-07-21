import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { loadOnboarding } from '../load-onboarding';
import { WorkerOnboarding } from './worker-onboarding';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Onboarding.worker' });
  return { title: t('title'), robots: { index: false } };
}

export default async function WorkerOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const initial = await loadOnboarding('WORKER');

  // No session, or the identity does not hold the Worker role — the Role
  // Switcher is how you get one, so send them somewhere that has it.
  if (!initial) {
    redirect({ href: '/app/home', locale });
    return null;
  }

  return <WorkerOnboarding initial={initial} />;
}
