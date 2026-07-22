import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { InboxScreen } from '@/components/messaging/inbox-screen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Messaging' });
  return { title: t('inboxTitle'), robots: { index: false } };
}

/**
 * The messaging inbox (MSG-01). Personal to the signed-in user; reads are
 * RBAC-scoped server-side, so this page is deliberately not indexable.
 */
export default async function MessagesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <InboxScreen />;
}
