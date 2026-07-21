import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { auth } from '@/auth';
import { redirect, Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { loadOnboarding } from '../onboarding/load-onboarding';
import type { OnboardingRole } from '@/lib/onboarding';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Home' });
  return { title: t('title'), robots: { index: false } };
}

const ONBOARDING_PATH: Record<OnboardingRole, string> = {
  WORKER: '/app/onboarding/worker',
  CLIENT: '/app/onboarding/client',
  BUSINESS: '/app/onboarding/business',
};

function isOnboardingRole(role: string): role is OnboardingRole {
  return role === 'WORKER' || role === 'CLIENT' || role === 'BUSINESS';
}

/**
 * The authenticated, ROLE-BASED home (ACC-07). Switching role re-renders this
 * screen for the new active role — an authenticated user is never shown the
 * guest exploration view.
 *
 * The full per-role dashboards are PROMPT 53.1; what this owns today is the
 * post-login landing and the onboarding entry point for the active role.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: '/app/explore', locale });
  }

  const t = await getTranslations('Home');
  const activeRole = session?.user?.activeRole ?? '';

  // AGENT and ADMIN have no self-service onboarding, so they simply get no card.
  const onboarding = isOnboardingRole(activeRole) ? await loadOnboarding(activeRole) : null;
  const roleKey = isOnboardingRole(activeRole) ? activeRole : 'CLIENT';

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
        {t(`greeting.${roleKey}`)}
      </h1>
      <p className="mt-2 text-muted-foreground">{t(`subtitle.${roleKey}`)}</p>

      {onboarding && !onboarding.completedAt && (
        <section className="mt-8 rounded-card border border-border bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                {t('onboardingHeading')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('onboardingBody', { percent: onboarding.completionPercent })}
              </p>
            </div>
            <Button asChild>
              <Link href={ONBOARDING_PATH[roleKey]}>
                {onboarding.completionPercent > 0 ? t('onboardingResume') : t('onboardingStart')}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>

          <div
            role="progressbar"
            aria-valuenow={onboarding.completionPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('onboardingHeading')}
            className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${onboarding.completionPercent}%` }}
            />
          </div>
        </section>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/app/explore"
          className="rounded-card border border-border bg-surface p-6 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <h2 className="font-heading text-lg font-semibold text-foreground">{t('exploreCard')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('exploreCardBody')}</p>
        </Link>

        <Link
          href="/app/jobs"
          className="rounded-card border border-border bg-surface p-6 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <h2 className="font-heading text-lg font-semibold text-foreground">{t('jobsCard')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(`jobsCardBody.${roleKey}`)}</p>
        </Link>
      </section>
    </div>
  );
}
