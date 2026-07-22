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
    // The console layout supplies the page's h1 and its width; this is a section
    // within it, so the heading is an h2.
    <div className="max-w-3xl">
      <h2 className="font-heading text-xl font-semibold text-foreground">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      <div className="mt-6">
        <ModerationQueue />
      </div>
    </div>
  );
}
