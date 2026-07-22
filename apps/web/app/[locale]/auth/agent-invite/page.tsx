import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AgentInviteAccept } from '@/components/admin/agent-invite-accept';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin' });
  // noindex: this page only means anything with a one-time token attached, and a
  // crawled invitation URL is a credential in a search index.
  return { title: t('acceptInviteTitle'), robots: { index: false, follow: false } };
}

/**
 * Agent onboarding by invitation (ADM-06).
 *
 * Deliberately under /auth rather than /app/admin: the person opening it is not
 * an admin and has no account at all yet. It sits beside the other
 * unauthenticated identity flows because that is what it is.
 */
export default async function AgentInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('Admin');

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
        {t('acceptInviteTitle')}
      </h1>
      <p className="mt-2 text-muted-foreground">{t('acceptInviteSubtitle')}</p>
      <div className="mt-8">
        <AgentInviteAccept token={token ?? null} />
      </div>
    </div>
  );
}
