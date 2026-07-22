import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LiveTrackingScreen } from '@/components/safety/live-tracking-screen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Safety' });
  return { title: t('tracking.title'), robots: { index: false } };
}

/**
 * The consented live-tracking map for an active job (SOS-03): the client watches
 * the worker en route with an arrival estimate.
 */
export default async function TrackingPage({
  params,
}: {
  params: Promise<{ locale: string; sessionId: string }>;
}) {
  const { locale, sessionId } = await params;
  setRequestLocale(locale);
  return <LiveTrackingScreen sessionId={sessionId} />;
}
