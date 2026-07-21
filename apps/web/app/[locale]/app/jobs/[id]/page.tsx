import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { JobDetailScreen } from '@/components/jobs/job-detail-screen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'JobDetail' });
  return { title: t('title'), robots: { index: false } };
}

/**
 * The Job-in-Progress screen (JOB-06, JOB-07). A published job is public
 * (ACC-01), but the actions on it are gated; the client component decides what
 * to show from who the viewer is, and the API authorises every transition.
 */
export default async function JobPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <JobDetailScreen jobId={id} />
    </div>
  );
}
