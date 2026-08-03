import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { TrustBreakdownView } from '@/components/trust/trust-breakdown';
import { isOnboardingRole } from '@/lib/onboarding';
import { loadTrustBreakdown } from './load-trust-breakdown';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Trust' });
  // Someone's own standing is never indexable.
  return { title: t('breakdownHeading'), robots: { index: false } };
}

/**
 * The signed-in user's Trust Score breakdown (TRU-04).
 *
 * Read server-side over GraphQL so the ring paints with the real score on first
 * frame — a trust screen that flashes 0 and then counts up to 62 has, for a
 * moment, told the user something false about themselves.
 */
export default async function TrustPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    // Your own score is not a guest read. Viewing ANOTHER identity's score is
    // public (that is the guest first-interface), and lands on their profile.
    redirect({ href: '/auth/login', locale });
  }

  const t = await getTranslations('Trust');
  const result = await loadTrustBreakdown();

  if (result.status !== 'ok') {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {t('breakdownHeading')}
        </h1>
        <p role="alert" className="mt-4 rounded-card border border-border bg-surface p-6 text-sm">
          {t('loadError')}
        </p>
      </div>
    );
  }

  const activeRole = session?.user?.activeRole ?? '';

  return (
    <TrustBreakdownView
      breakdown={result.breakdown}
      isOwnScore
      activeRole={isOnboardingRole(activeRole) ? activeRole : null}
    />
  );
}
