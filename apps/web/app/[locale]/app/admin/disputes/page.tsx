import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { AdminDisputeQueue } from '@/components/disputes/admin-dispute-queue';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Disputes' });
  return { title: t('admin.queueTitle'), robots: { index: false } };
}

/**
 * The admin dispute-resolution queue (ADM-05).
 *
 * The role check is a ROUTING courtesy — it sends a non-admin somewhere useful
 * rather than rendering a board whose every query would 403. Authorisation is
 * the API's `admin:dispute_resolve` guard, which a client cannot talk past.
 * Gating on the ACTIVE role is deliberate: an admin currently acting as a Client
 * is browsing as a client.
 */
export default async function AdminDisputesPage({
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
  if (session?.user?.activeRole !== 'ADMIN') {
    redirect({ href: '/app/home', locale });
  }

  const t = await getTranslations('Disputes');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
        {t('admin.queueTitle')}
      </h1>
      <p className="mt-2 text-muted-foreground">{t('admin.queueSubtitle')}</p>
      <div className="mt-8">
        <AdminDisputeQueue />
      </div>
    </div>
  );
}
