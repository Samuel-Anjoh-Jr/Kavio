import type { Metadata } from 'next';
import { redirect } from '@/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthShell } from '@/components/auth/auth-shell';
import { TwoFactorForm } from './two-factor-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.twoFactor' });
  return { title: t('title'), robots: { index: false } };
}

export default async function TwoFactorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ identifier?: string; next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { identifier, next } = await searchParams;

  // Without an identifier there is no challenge to complete — send them back to
  // the start rather than rendering a form that can only fail.
  if (!identifier) {
    redirect({ href: '/auth/login', locale });
  }

  const t = await getTranslations('Auth.twoFactor');

  return (
    <AuthShell title={t('title')} subtitle={t('subtitle')}>
      <TwoFactorForm identifier={identifier as string} next={next ?? null} />
    </AuthShell>
  );
}
