import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { PipelineBoard } from '@/components/verification/pipeline-board';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ReviewBoard' });
  return { title: t('heading'), robots: { index: false } };
}

/** Roles that hold `admin:verification_review` in the API's RBAC catalogue. */
const REVIEWER_ROLES = new Set(['ADMIN', 'AGENT']);

/**
 * The verification pipeline board (AGT-02, ADM-03).
 *
 * The role check here is a ROUTING courtesy, not the control: it sends a worker
 * who wandered in somewhere useful instead of rendering a board that would fail
 * every query. Authorisation is the API's `admin:verification_review` guard on
 * each read and each write, which a client cannot talk its way past.
 *
 * Gating on the ACTIVE role rather than held roles is deliberate — an admin
 * currently acting as a Client is browsing as a client, and the queue is not
 * part of that.
 */
export default async function ReviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();

  if (!session?.user?.id) {
    redirect({ href: '/auth/login', locale });
  }

  if (!REVIEWER_ROLES.has(session?.user?.activeRole ?? '')) {
    redirect({ href: '/app/home', locale });
  }

  return <PipelineBoard />;
}
