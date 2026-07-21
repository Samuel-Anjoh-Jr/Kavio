import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { VerificationScreen } from '@/components/verification/verification-screen';
import { loadVerification } from './load-verification';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'VerificationScreen' });
  // Someone's verification progress is never indexable.
  return { title: t('heading'), robots: { index: false } };
}

/**
 * The worker's own verification journey (TRU-05).
 *
 * Which checks someone has failed is private — the API's `myVerifications` is
 * scoped to the caller and is not @Public(), unlike the Trust Score. A guest is
 * sent to sign in rather than shown an empty journey.
 */
export default async function VerificationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: '/auth/login', locale });
  }

  const t = await getTranslations('VerificationScreen');
  const result = await loadVerification();

  if (result.status !== 'ok') {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {t('heading')}
        </h1>
        <p role="alert" className="mt-4 rounded-card border border-border bg-surface p-6 text-sm">
          {t('loadError')}
        </p>
      </div>
    );
  }

  return <VerificationScreen records={result.records} tier={result.tier} />;
}
