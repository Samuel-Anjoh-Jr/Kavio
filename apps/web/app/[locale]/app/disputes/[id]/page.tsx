import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DisputeDetailScreen } from '@/components/disputes/dispute-detail-screen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Disputes' });
  return { title: t('title'), robots: { index: false } };
}

/**
 * The parties' dispute detail view (PAY-03): timeline, messages, evidence and
 * the frozen-escrow assurance. Personal to the parties; reads are RBAC-guarded
 * server-side.
 */
export default async function DisputePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <DisputeDetailScreen disputeId={id} />
    </div>
  );
}
