import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { BusinessDashboard } from '@/components/business/business-dashboard';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'BusinessConsole' });
  return { title: t('dashboardTitle'), robots: { index: false } };
}

/**
 * The business dashboard (BIZ-01, BIZ-02).
 *
 * The active-role check is a ROUTING courtesy: authorisation is the API's
 * `business:manage` guard plus the per-business access level resolved on every
 * query. Gating on the ACTIVE role is deliberate — a business owner currently
 * acting as a Client is hiring as a client, and the company console is not part
 * of that session.
 */
export default async function BusinessDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: '/auth/login?next=/app/business', locale });
  }
  if (session?.user?.activeRole !== 'BUSINESS') {
    redirect({ href: '/app/home', locale });
  }

  const t = await getTranslations('BusinessConsole');

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
        {t('dashboardTitle')}
      </h1>
      <p className="mt-2 text-muted-foreground">{t('dashboardSubtitle')}</p>
      <div className="mt-8">
        <BusinessDashboard />
      </div>
    </div>
  );
}
