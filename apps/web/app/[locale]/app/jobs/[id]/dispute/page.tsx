import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { OpenDisputeForm } from '@/components/disputes/open-dispute-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Disputes' });
  return { title: t('openTitle'), robots: { index: false } };
}

/**
 * Open a dispute on a job (PAY-03). Opening freezes the escrow, so this is a
 * deliberate form; on success it routes to the dispute detail view.
 */
export default async function OpenDisputePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Disputes');

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
        {t('openTitle')}
      </h1>
      <p className="mt-2 text-muted-foreground">{t('openSubtitle')}</p>
      <div className="mt-8">
        <OpenDisputeForm jobId={id} />
      </div>
    </div>
  );
}
