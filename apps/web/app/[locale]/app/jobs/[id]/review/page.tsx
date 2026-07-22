import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { ReviewForm } from '@/components/reviews/review-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Reviews' });
  return { title: t('submitTitle'), robots: { index: false } };
}

/**
 * Leave a review on a completed job (REV-01).
 *
 * Login-gated: a review has to be attributable to the party that paid for the
 * job. Whether this particular caller may review THIS job is decided by the
 * API's eligibility read inside the form — the session check here only
 * establishes that there is somebody to attribute it to.
 */
export default async function LeaveReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: `/auth/login?next=/app/jobs/${id}/review`, locale });
  }

  const t = await getTranslations('Reviews');

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
        {t('submitTitle')}
      </h1>
      <p className="mt-2 text-muted-foreground">{t('submitSubtitle')}</p>
      <div className="mt-8">
        <ReviewForm jobId={id} />
      </div>
    </div>
  );
}
