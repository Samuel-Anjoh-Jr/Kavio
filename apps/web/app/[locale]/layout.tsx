import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { Geist, Geist_Mono, Inter, Inter_Tight, IBM_Plex_Sans } from 'next/font/google';
import { routing } from '@/i18n/routing';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/toaster';
import { SITE_URL, OG_LOCALES, twitterHandle, verificationTokens } from '@/lib/site-config';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const interTight = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin'],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: '--font-ibm-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const handle = twitterHandle();

  /**
   * Site-wide metadata DEFAULTS. Individual public pages override the specifics
   * through `buildMetadata`; what lives here is the entity-level frame every page
   * inherits — a templated title so a sub-page reads "Explore · Kavio", the
   * canonical origin (`metadataBase`), the publisher/creator identity, and the
   * `format-detection` guard that stops phone browsers auto-linking numbers in
   * copy as if they were dial links.
   */
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: t('title'),
      template: `%s · Kavio`,
    },
    description: t('description'),
    applicationName: 'Kavio',
    authors: [{ name: 'Kavio' }],
    creator: 'Kavio',
    publisher: 'Kavio',
    category: 'marketplace',
    formatDetection: { telephone: false, email: false, address: false },
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l === 'fr' ? 'fr-CM' : 'en-CM', `${SITE_URL}/${l}`]),
      ),
    },
    openGraph: {
      type: 'website',
      siteName: 'Kavio',
      locale: OG_LOCALES[locale] ?? 'en_CM',
      title: t('title'),
      description: t('description'),
    },
    twitter: {
      card: 'summary_large_image',
      ...(handle ? { site: handle, creator: handle } : {}),
    },
    ...(Object.keys(verificationTokens()).length > 0 ? { verification: verificationTokens() } : {}),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${interTight.variable} ${ibmPlexSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {children}
            <Toaster />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
