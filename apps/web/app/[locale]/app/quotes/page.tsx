import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { QuoteInboxesScreen } from '@/components/quotes/quote-inboxes-screen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Quotes' });
  return { title: t('title'), robots: { index: false } };
}

/**
 * The quote inboxes (QTE-02, QTE-05). Personal to the signed-in caller; the
 * screen renders the Worker (Sent/Drafts) or Client (Received) view from the
 * active role, and bounces a guest to sign-in.
 */
export default async function QuotesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Quotes');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
        {t('title')}
      </h1>
      <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
      <div className="mt-8">
        <QuoteInboxesScreen />
      </div>
    </div>
  );
}
