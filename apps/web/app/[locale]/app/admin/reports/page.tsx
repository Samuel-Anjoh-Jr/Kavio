import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { ModerationQueue } from '@/components/moderation/moderation-queue';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Moderation' });
  return { title: t('title'), robots: { index: false } };
}

/**
 * The admin moderation workspace (ADM-08): reported content grouped by item.
 *
 * The role check is a routing courtesy; authorisation is the API's
 * `admin:moderate` guard, which a client cannot talk past. Gating on the ACTIVE
 * role is deliberate — an admin currently acting as a Client browses as a client.
 */
export default async function AdminReportsPage({
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

  const t = await getTranslations('Moderation');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
        {t('title')}
      </h1>
      <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
      <div className="mt-8">
        <ModerationQueue />
      </div>
    </div>
  );
}
