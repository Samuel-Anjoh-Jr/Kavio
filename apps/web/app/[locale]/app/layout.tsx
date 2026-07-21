import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { MotionProvider } from '@/components/motion/motion-provider';
import { PageTransition } from '@/components/motion/page-transition';
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register';
import { AppHeader } from '@/components/nav/app-header';
import { AppBottomNav } from '@/components/nav/app-bottom-nav';
import { RoleTransition } from '@/components/nav/role-transition';
import { LocationProvider } from '@/components/discovery/location-provider';

/**
 * App shell segment (`/{locale}/app/...`): minimal motion, no Lenis (native
 * scroll for dense, data-heavy surfaces per CLAUDE.md §26.2 "app/admin
 * surfaces stay minimal"). This is also the ONLY segment that links a PWA
 * manifest, registers the service worker, and sets an app theme-color — the
 * marketing route group deliberately does none of this, so it is never
 * installable and never controlled by the service worker (PROMPT 18).
 *
 * The shell renders for GUESTS too (ACC-01): unauthenticated visitors browse
 * the real app, and only state-changing actions are gated (ACC-02).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  return {
    manifest: `/${locale}/app/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'TrustPro',
    },
    icons: {
      apple: `/${locale}/app/icons/apple-180`,
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#3d5afe',
};

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <MotionProvider profile="app">
      <ServiceWorkerRegister locale={locale} />
      {/* The chosen browsing location is shared by every discovery surface
          (DIS-09), so it lives at the shell rather than per screen — two screens
          holding their own copy is how a feed and a search end up disagreeing
          about where the user is. */}
      <LocationProvider>
        <div className="flex min-h-dvh flex-col">
          <AppHeader />
          <main className="flex-1">
            {/* Animates the whole surface when the active role changes (ACC-07). */}
            <RoleTransition>
              <PageTransition>{children}</PageTransition>
            </RoleTransition>
          </main>
          <AppBottomNav />
        </div>
      </LocationProvider>
    </MotionProvider>
  );
}
