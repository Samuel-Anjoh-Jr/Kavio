import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { AdminDisputeScreen } from '@/components/disputes/admin-dispute-screen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Disputes' });
  return { title: t('admin.title'), robots: { index: false } };
}

/**
 * The admin dispute-resolution workspace for one dispute (ADM-05). Role check is
 * a routing courtesy; the API's `admin:dispute_resolve` guard is the control on
 * both the read and the resolve action.
 */
export default async function AdminDisputePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: '/auth/login', locale });
  }
  if (session?.user?.activeRole !== 'ADMIN') {
    redirect({ href: '/app/home', locale });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <AdminDisputeScreen disputeId={id} />
    </div>
  );
}
