import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { WalletScreen } from '@/components/transactions/wallet-screen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Transactions' });
  return { title: t('title'), robots: { index: false } };
}

/**
 * The wallet, escrow timeline and transactions surface (PAY-02, PAY-05).
 * Personal to the signed-in caller; the client component bounces a guest.
 */
export default async function WalletPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Transactions');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
        {t('title')}
      </h1>
      <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
      <div className="mt-8">
        <WalletScreen />
      </div>
    </div>
  );
}
