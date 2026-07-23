import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { GuestHome } from '@/components/discovery/guest-home';
import { buildMetadata } from '@/lib/seo';

/**
 * The guest first-interface is a PUBLIC, crawlable discovery surface (ACC-01),
 * so it carries a clean canonical and an OG image like any landing page —
 * routed through buildMetadata so all four required fields come as one (§26.4).
 * The clean base path is the canonical; any filter query is stripped by
 * buildMetadata, so a filtered variant never competes with it to rank.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Explore' });
  return buildMetadata({
    locale,
    path: '/app/explore',
    title: t('title'),
    description: t('subtitle'),
  });
}

/**
 * The guest first-interface (DIS-01, DIS-02, ACC-01).
 *
 * Reserved for UNAUTHENTICATED visitors. CLAUDE.md is explicit that a signed-in
 * user is never shown the guest view, so the redirect lives here at the route
 * rather than being re-decided inside the screen — one guard, in the one place
 * that runs before anything renders.
 */
export default async function ExplorePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (session?.user?.id) {
    redirect({ href: '/app/home', locale });
  }

  return <GuestHome />;
}
