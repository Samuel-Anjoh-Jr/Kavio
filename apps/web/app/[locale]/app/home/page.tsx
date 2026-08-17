import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, BriefcaseBusiness, CalendarClock, Users } from 'lucide-react';
import { auth } from '@/auth';
import { redirect, Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { TierBadge } from '@/components/trust/tier-badge';
import { BusinessUpgradeHint } from '@/components/business/business-upgrade-hint';
import { WorkerVerificationBanner } from '@/components/verification/worker-verification-banner';
import { FeaturedStatusCard } from '@/components/featured/featured-status-card';
import { TrustScoreRing } from '@/components/trust/trust-score-ring';
import { DiscoverRail } from '@/components/home/discover-rail';
import { HomeSection, PendingPanel } from '@/components/home/home-primitives';
import {
  ClientJobsPanel,
  ClientQuotesPanel,
  WorkerEarningsPanel,
  WorkerJobRequestsPanel,
  WorkerPipelinePanel,
} from '@/components/home/dashboard-panels';
import type { OnboardingRole } from '@/lib/onboarding';
import { loadOnboarding } from '../onboarding/load-onboarding';
import { loadTrustBreakdown } from '../trust/load-trust-breakdown';

/**
 * The authenticated, ROLE-BASED home (ACC-07, DIS-01) — PROMPT 53.1.
 *
 * A signed-in user is never shown the guest exploration view; they land here,
 * framed for the role they are ACTING AS. Switching role re-renders this screen
 * for the new role (RoleSwitcher calls router.refresh), and because tier and
 * Trust Score attach to the IDENTITY rather than the role, the trust snapshot is
 * identical across all three homes — a Worker who switches to Client does not
 * become less verified.
 *
 * The pipeline panels (job requests, quotes, earnings) read real data from
 * `components/home/dashboard-panels.tsx` — an honest empty state when there is
 * nothing yet, never an invented number. Only the business console's own
 * numbers stay behind their console (see BusinessHome below, and
 * components/home/home-primitives.tsx for the one remaining placeholder use).
 */

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

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: '/app/explore', locale });
  }

  const t = await getTranslations('Home');
  const tRole = await getTranslations('RoleHome');

  const userId = session?.user?.id as string;
  const activeRole = session?.user?.activeRole ?? '';
  const roleKey: OnboardingRole = isOnboardingRole(activeRole) ? activeRole : 'CLIENT';

  // AGENT and ADMIN have no self-service onboarding, so they simply get no card.
  const [onboarding, trust] = await Promise.all([
    isOnboardingRole(activeRole) ? loadOnboarding(activeRole) : Promise.resolve(null),
    loadTrustBreakdown(),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
            {t(`greeting.${roleKey}`)}
          </h1>
          <p className="mt-2 text-muted-foreground">{t(`subtitle.${roleKey}`)}</p>
        </div>

        {/* The identity's standing, shown on every role's home. It is the same
            number and the same tier whichever role is active — that is the
            entire promise of the role switcher. */}
        {trust.status === 'ok' && (
          <Link
            href="/app/trust"
            className="flex items-center gap-4 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <TrustScoreRing
              score={trust.breakdown.total}
              tier={trust.breakdown.tier}
              suspended={trust.breakdown.suspended}
              size="sm"
            />
            <span className="flex flex-col gap-1">
              <TierBadge
                tier={trust.breakdown.tier}
                suspended={trust.breakdown.suspended}
                size="sm"
              />
              <span className="text-xs text-muted-foreground">{tRole('viewTrust')}</span>
            </span>
          </Link>
        )}
      </div>

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

      {/* Only the WORKER role: a client is not gated on any of this, and
          showing them a verification wall would be a lie about what we ask of
          them. The banner hides itself once the profile is listable. */}
      {roleKey === 'WORKER' && <WorkerVerificationBanner />}

      {roleKey === 'WORKER' && <WorkerHome userId={userId} />}
      {roleKey === 'CLIENT' && <ClientHome />}
      {roleKey === 'BUSINESS' && <BusinessHome />}
    </div>
  );
}

async function WorkerHome({ userId }: { userId: string }) {
  const t = await getTranslations('RoleHome');

  return (
    <>
      <HomeSection
        title={t('worker.requestsHeading')}
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/app/workers/${userId}`}>
              {t('worker.viewPublicProfile')}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      >
        <WorkerJobRequestsPanel />
      </HomeSection>

      <HomeSection title={t('worker.pipelineHeading')}>
        <WorkerPipelinePanel />
      </HomeSection>

      <HomeSection
        title={t('worker.growthHeading')}
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/app/verification">
              {t('worker.continueVerification')}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <WorkerEarningsPanel />

          {/* Availability is edited where it is captured today; the dedicated
              management screen arrives with PROMPT 48. */}
          <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CalendarClock aria-hidden className="size-5" />
            </span>
            <div>
              <h3 className="font-medium text-foreground">{t('worker.availabilityTitle')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t('worker.availabilityBody')}</p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link href="/app/onboarding/worker">{t('worker.manageAvailability')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </HomeSection>

      {/* Sponsored ranking placement: kept alongside the other growth levers,
          and — unlike WorkerVerificationBanner — never hides once a listing
          exists, since its job is to keep showing status. */}
      <HomeSection title={t('worker.featuredHeading')}>
        <FeaturedStatusCard />
      </HomeSection>
    </>
  );
}

async function ClientHome() {
  const t = await getTranslations('RoleHome');

  return (
    <>
      {/* No "post a job" action here: an individual client hires by finding a
          worker and requesting a quote from their profile (JOB-01) — DiscoverRail
          is the whole of that action, not a teaser for a broadcast posting flow. */}
      <HomeSection title={t('client.discoverHeading')}>
        <DiscoverRail />
      </HomeSection>

      {/* The on-ramp to the job board. Hides itself once the identity can
          already post, so a verified business never sees it. */}
      <BusinessUpgradeHint />

      <HomeSection title={t('client.jobsHeading')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <ClientJobsPanel />
          <ClientQuotesPanel />
        </div>
      </HomeSection>
    </>
  );
}

async function BusinessHome() {
  const t = await getTranslations('RoleHome');

  return (
    <>
      <HomeSection title={t('business.hiringHeading')}>
        <DiscoverRail />
      </HomeSection>

      {/* The home stays a summary; the numbers themselves live in the console
          (BIZ-02), which resolves the caller's access level before it shows a
          company's spend. Linking rather than duplicating means the home never
          has to answer "may this person see the money". */}
      <HomeSection
        title={t('business.operationsHeading')}
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/app/business">
              {t('business.openConsole')}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/app/business/team"
            className="rounded-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <PendingPanel
              icon={<Users aria-hidden className="size-5" />}
              title={t('business.teamPanelTitle')}
              body={t('business.teamPanelBody')}
            />
          </Link>
          <Link
            href="/app/business"
            className="rounded-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <PendingPanel
              icon={<BriefcaseBusiness aria-hidden className="size-5" />}
              title={t('business.jobsPanelTitle')}
              body={t('business.jobsPanelBody')}
            />
          </Link>
        </div>
      </HomeSection>

      {/* Sponsored ranking placement: the same card and same identity-level
          status as the worker home (components/featured/featured-status-card.tsx).
          Kept here too — not only in the business console (BIZ-02) — so a
          'featured.approved/rejected/revoked' notification always lands
          somewhere that shows the status, whichever role was active. */}
      <HomeSection title={t('business.featuredHeading')}>
        <FeaturedStatusCard />
      </HomeSection>
    </>
  );
}
