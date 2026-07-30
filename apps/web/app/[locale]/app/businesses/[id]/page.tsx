import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BusinessProfileScreen } from '@/components/profile/business-profile-screen';
import { buildMetadata } from '@/lib/seo';
import { loadBusinessProfile } from './load-business-profile';

/**
 * The public company profile (PRO-06). Open to guests, like every other
 * discovery read (ACC-01).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'Business' });
  const load = await loadBusinessProfile(id);

  if (load.status !== 'ok') {
    return { title: t('notFoundTitle'), robots: { index: false } };
  }

  const description = load.profile.description ?? t('metaFallback', { name: load.profile.name });

  // Routed through the same buildMetadata every other public page uses, so a
  // business profile carries canonical, hreflang and rich-preview robots
  // directives instead of the bare object this used to return.
  return buildMetadata({
    locale,
    path: `/app/businesses/${id}`,
    title: load.profile.name,
    description,
    type: 'profile',
    ...(load.profile.logoUrl ? { image: load.profile.logoUrl } : {}),
  });
}

export default async function BusinessProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const load = await loadBusinessProfile(id);

  if (load.status === 'not-found') notFound();

  if (load.status === 'error') {
    const t = await getTranslations({ locale, namespace: 'Business' });
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          {t('loadErrorTitle')}
        </h1>
        <p className="mt-2 text-muted-foreground">{t('loadErrorBody')}</p>
      </div>
    );
  }

  return <BusinessProfileScreen profile={load.profile} />;
}
