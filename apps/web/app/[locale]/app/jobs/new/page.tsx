import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { PostJobStepper } from '@/components/jobs/post-job-stepper';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'PostJob' });
  return { title: t('title'), robots: { index: false } };
}

/**
 * Reachable by guests on purpose: they may DRAFT a job without an account, and
 * only the act of posting is gated (ACC-02). Signed-in CLIENT identities are
 * turned away here too, not just kept off the CTAs that lead here (JOB-01): an
 * individual hires by requesting a quote from a worker's profile, never by
 * broadcasting a vacancy, and the server would reject the publish anyway.
 */
export default async function NewJobPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (session?.user?.activeRole === 'CLIENT') {
    redirect({ href: '/app/jobs', locale });
  }

  const t = await getTranslations('PostJob');

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
        {t('title')}
      </h1>
      <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
      <div className="mt-8">
        <PostJobStepper />
      </div>
    </div>
  );
}
