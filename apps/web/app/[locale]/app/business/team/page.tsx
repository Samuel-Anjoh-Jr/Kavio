import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { Link, redirect } from '@/i18n/navigation';
import { TeamManager } from '@/components/business/team-manager';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'BusinessConsole' });
  return { title: t('teamTitle'), robots: { index: false } };
}

/**
 * Team management (BIZ-03).
 *
 * The page renders for anyone who can open the console; whether the visitor may
 * CHANGE anything is decided from `myBusinessAccess` inside the component and
 * enforced by the API's `business:team_manage` guard. A staff member with
 * view-only access sees the roster they are part of, read-only — which is
 * information they are entitled to, not a permission leak.
 */
export default async function BusinessTeamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: '/auth/login?next=/app/business/team', locale });
  }
  if (session?.user?.activeRole !== 'BUSINESS') {
    redirect({ href: '/app/home', locale });
  }

  const t = await getTranslations('BusinessConsole');

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/app/business"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        {t('backToDashboard')}
      </Link>
      <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground">
        {t('teamTitle')}
      </h1>
      <p className="mt-2 text-muted-foreground">{t('teamSubtitle')}</p>
      <div className="mt-8">
        <TeamManager />
      </div>
    </div>
  );
}
