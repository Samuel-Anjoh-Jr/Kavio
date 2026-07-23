import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo';
import { LegalPage, type LegalSection } from '../legal-page';

/**
 * Terms (SRS §26.6: legal pages ship at launch as static pages).
 *
 * Statically rendered per locale; the copy is a placeholder legal skeleton to be
 * replaced by counsel-reviewed text before launch, but the ROUTE, the metadata,
 * the footer link and the EN/FR structure are real and done.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Legal.terms' });

  return buildMetadata({
    locale,
    path: '/legal/terms',
    title: t('title'),
    description: t('intro'),
  });
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Legal.terms');

  // t.raw pulls the structured section array straight from the catalogue, so
  // adding a clause is a translation edit rather than a code change.
  const sections = (t.raw('sections') as LegalSection[]) ?? [];

  return (
    <LegalPage
      copy={{
        title: t('title'),
        updated: t('updated'),
        intro: t('intro'),
        sections,
      }}
    />
  );
}
