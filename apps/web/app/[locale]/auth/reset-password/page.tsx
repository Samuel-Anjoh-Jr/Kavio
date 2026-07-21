import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthShell } from '@/components/auth/auth-shell';
import { FormBanner } from '@/components/auth/form-banner';
import { ResetPasswordForm } from './reset-password-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.resetPassword' });
  return { title: t('title'), robots: { index: false } };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { token } = await searchParams;
  const t = await getTranslations('Auth.resetPassword');

  return (
    <AuthShell title={t('title')} subtitle={t('subtitle')}>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        // A link opened without its token is expired or mangled — say so
        // plainly instead of rendering a form that cannot succeed.
        <FormBanner tone="error" message={t('missingToken')} />
      )}
    </AuthShell>
  );
}
