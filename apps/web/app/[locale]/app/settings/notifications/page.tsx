import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NotificationPreferencesScreen } from '@/components/notifications/notification-preferences-screen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Notifications' });
  return { title: t('settings.title'), robots: { index: false } };
}

/**
 * Per-channel notification preferences (NOT-02, SET-02), including the web-push
 * opt-in. SMS is shown as coming soon.
 */
export default async function NotificationSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NotificationPreferencesScreen />;
}
