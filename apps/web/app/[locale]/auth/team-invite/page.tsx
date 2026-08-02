import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TeamInviteAccept } from '@/components/business/team-invite-accept';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'BusinessConsole' });
  // noindex: this page only means anything with a one-time token attached, and a
  // crawled invitation URL is a credential in a search index.
  return { title: t('teamInviteTitle'), robots: { index: false, follow: false } };
}

/**
 * Business team onboarding by invitation (BIZ-03).
 *
 * Deliberately under /auth rather than /app/business: the person opening it is
 * not signed in and usually has no account at all yet. It sits beside the
 * other unauthenticated identity flows because that is what it is.
 */
export default async function TeamInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('BusinessConsole');

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
        {t('teamInviteTitle')}
      </h1>
      <p className="mt-2 text-muted-foreground">{t('teamInviteSubtitle')}</p>
      <div className="mt-8">
        <TeamInviteAccept token={token ?? null} />
      </div>
    </div>
  );
}
