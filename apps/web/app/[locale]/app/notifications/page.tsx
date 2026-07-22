import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NotificationCenterScreen } from '@/components/notifications/notification-center-screen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Notifications' });
  return { title: t('title'), robots: { index: false } };
}

/** The Notification Center (NOT-02). Personal to the signed-in user. */
export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NotificationCenterScreen />;
}
