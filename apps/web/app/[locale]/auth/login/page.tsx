import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from './login-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.login' });
  return { title: t('title'), robots: { index: false } };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; intent?: string; reason?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { next, intent, reason } = await searchParams;
  const t = await getTranslations('Auth.login');

  return (
    <AuthShell title={t('title')} subtitle={t('subtitle')}>
      <LoginForm
        next={next ?? null}
        gatedAction={intent ?? null}
        sessionExpired={reason === 'session_expired'}
      />
    </AuthShell>
  );
}
