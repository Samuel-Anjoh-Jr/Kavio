import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { ModerationCaseScreen } from '@/components/moderation/moderation-case-screen';
import type { ReportTargetType } from '@/lib/reports';

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
 * One moderation case (ADM-08): the reported item, the party, every complaint,
 * and the action panel. Admin-only; authorisation is the API's `admin:moderate`
 * guard.
 */
export default async function ModerationCasePage({
  params,
}: {
  params: Promise<{ locale: string; targetType: string; targetId: string }>;
}) {
  const { locale, targetType, targetId } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: '/auth/login', locale });
  }
  if (session?.user?.activeRole !== 'ADMIN') {
    redirect({ href: '/app/home', locale });
  }

  return <ModerationCaseScreen targetType={targetType as ReportTargetType} targetId={targetId} />;
}
