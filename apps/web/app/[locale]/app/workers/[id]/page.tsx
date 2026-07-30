import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { WorkerProfileScreen } from '@/components/profile/worker-profile-screen';
import { JsonLd } from '@/components/seo/json-ld';
import { buildMetadata, canonicalFor } from '@/lib/seo';
import { graph, localBusinessNode, webPageNode } from '@/lib/structured-data';
import { SERVICE_AREAS } from '@/lib/site-config';
import { loadWorkerProfile } from './load-worker-profile';

const PROFILE_PATH_PREFIX = '/app/workers';

/** The primary trade shown in metadata and structured data: the first listed service's category. */
function primaryTrade(
  profile: { services: { categoryNameEn: string | null; categoryNameFr: string | null }[] },
  locale: string,
): string | null {
  const service = profile.services[0];
  if (!service) return null;
  return (locale === 'fr' ? service.categoryNameFr : service.categoryNameEn) ?? null;
}

/** The region name for a profile's city, from the same list `areaServed` is built from. */
function regionForCity(city: string | null): string | null {
  return SERVICE_AREAS.find((area) => area.name === city)?.region ?? null;
}

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

  const { profile } = load;
  const name = profile.name ?? t('unnamed');
  const description = profile.headline ?? t('metaFallback', { name });
  const trade = primaryTrade(profile, locale);
  const title =
    trade && profile.city ? t('metaTitleWithTrade', { name, trade, city: profile.city }) : name;

  // Profiles are the platform's public, crawlable surface: a client
  // searching "electrician Akwa" should be able to find a real one. Routed
  // through the same buildMetadata every other public page uses, so a
  // worker profile carries the same canonical, hreflang and rich-preview
  // robots directives as the landing page instead of the bare object this
  // used to return.
  return buildMetadata({
    locale,
    path: `${PROFILE_PATH_PREFIX}/${id}`,
    title,
    description,
    type: 'profile',
    ...(profile.avatar ? { image: profile.avatar } : {}),
  });
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

  const t = await getTranslations({ locale, namespace: 'Profile' });

  if (load.status === 'error') {
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
  const { profile } = load;
  const isOwner = session?.user?.id === profile.userId;

  const name = profile.name ?? t('unnamed');
  const description = profile.headline ?? t('metaFallback', { name });
  const trade = primaryTrade(profile, locale);
  const url = canonicalFor(locale, `${PROFILE_PATH_PREFIX}/${id}`);
  const title =
    trade && profile.city ? t('metaTitleWithTrade', { name, trade, city: profile.city }) : name;

  const structuredData = graph([
    webPageNode({ locale, url, title, description, primary: true }),
    localBusinessNode({
      url,
      name,
      description,
      image: profile.avatar,
      trade,
      city: profile.city,
      region: regionForCity(profile.city),
      ratingValue: profile.reviews.averageRating,
      reviewCount: profile.reviews.ratedJobCount,
    }),
  ]);

  return (
    <>
      <JsonLd data={structuredData} />
      <WorkerProfileScreen profile={profile} isOwner={isOwner} />
    </>
  );
}
