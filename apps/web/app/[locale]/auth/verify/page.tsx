import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthShell } from '@/components/auth/auth-shell';
import { VerifyForm } from './verify-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.verify' });
  return { title: t('title'), robots: { index: false } };
}

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ identifier?: string; purpose?: string; next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { identifier, purpose, next } = await searchParams;
  const t = await getTranslations('Auth.verify');

  return (
    <AuthShell title={t('title')} subtitle={t('subtitle')}>
      <VerifyForm
        initialIdentifier={identifier ?? ''}
        purpose={purpose === 'LOGIN' ? 'LOGIN' : 'PHONE_VERIFICATION'}
        next={next ?? null}
      />
    </AuthShell>
  );
}
