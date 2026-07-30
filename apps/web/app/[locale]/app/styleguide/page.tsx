import { setRequestLocale } from 'next-intl/server';
import { StyleguideClient } from './styleguide-client';

export default async function StyleguidePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <StyleguideClient />;
}
