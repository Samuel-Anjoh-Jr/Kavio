import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { WorkerProfileScreen } from '@/components/profile/worker-profile-screen';
import { loadWorkerProfile } from './load-worker-profile';

/**
 * The public worker profile (PRO-01…PRO-05).
 *
 * Open to guests. This is the screen the whole guest first-interface exists to
 * lead to: a visitor sees the complete evidence — trust, portfolio, prices,
 * availability — before they are ever asked for an account (ACC-01). The login
 * wall stands at the ACTIONS, which is what ProfileActions enforces.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'Profile' });
  const load = await loadWorkerProfile(id);

  if (load.status !== 'ok') {
    return { title: t('notFoundTitle'), robots: { index: false } };
  }

  const name = load.profile.name ?? t('unnamed');
  const description = load.profile.headline ?? t('metaFallback', { name });

  return {
    title: name,
    description,
    // Profiles are the platform's public, crawlable surface — a client
    // searching "electrician Akwa" should be able to find a real one.
    openGraph: {
      title: name,
      description,
      type: 'profile',
      ...(load.profile.avatar ? { images: [load.profile.avatar] } : {}),
    },
  };
}

export default async function WorkerProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [load, session] = await Promise.all([loadWorkerProfile(id), auth()]);

  if (load.status === 'not-found') notFound();

  if (load.status === 'error') {
    const t = await getTranslations({ locale, namespace: 'Profile' });
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          {t('loadErrorTitle')}
        </h1>
        <p className="mt-2 text-muted-foreground">{t('loadErrorBody')}</p>
      </div>
    );
  }

  // Ownership is decided on the IDENTITY, not the active role: a worker who has
  // switched to their Client role is still the owner of this profile.
  const isOwner = session?.user?.id === load.profile.userId;

  return <WorkerProfileScreen profile={load.profile} isOwner={isOwner} />;
}
