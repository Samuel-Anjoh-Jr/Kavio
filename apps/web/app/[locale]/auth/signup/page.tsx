import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignUpForm } from './signup-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.signUp' });
  return { title: t('title'), robots: { index: false } };
}

export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ intent?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { intent } = await searchParams;
  const t = await getTranslations('Auth.signUp');

  // The guest first-interface links here with an intent already chosen ("I want
  // to hire"), so the choice is pre-selected rather than asked twice.
  const defaultIntent = intent === 'find_work' ? 'find_work' : 'hire';

  return (
    <AuthShell title={t('title')} subtitle={t('subtitle')}>
      <SignUpForm defaultIntent={defaultIntent} />
    </AuthShell>
  );
}
