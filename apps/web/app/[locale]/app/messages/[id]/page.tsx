import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ConversationScreen } from '@/components/messaging/conversation-screen';

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
 * One conversation (MSG-01, MSG-02): real-time text/voice/card exchange with
 * inline escrow and job status. Private to the two parties.
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <ConversationScreen conversationId={id} />;
}
