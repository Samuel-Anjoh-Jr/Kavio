import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { MotionProvider } from '@/components/motion/motion-provider';
import { PageTransition } from '@/components/motion/page-transition';
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { OfflineIndicator } from '@/components/pwa/offline-indicator';
import { SkipLink } from '@/components/a11y/skip-link';
import { AppHeader } from '@/components/nav/app-header';
import { AppBottomNav } from '@/components/nav/app-bottom-nav';
import { RoleTransition } from '@/components/nav/role-transition';
import { LocationProvider } from '@/components/discovery/location-provider';
import { SPLASH_SPECS, splashHref, splashMedia } from '@/lib/pwa/splash-screens';

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
      // `default` keeps the iOS status bar legible against the app's own
      // background in BOTH themes. `black-translucent` would put the status bar
      // text over the page content, which reads as a rendering bug at the top of
      // every screen.
      statusBarStyle: 'default',
      title: 'TrustPro',
    },
    icons: {
      apple: `/${locale}/app/icons/apple-180`,
    },
    // Deliberately NO blanket `robots: noindex` here. The app shell is mostly
    // private, but it also hosts the guest-browsable discovery surfaces —
    // explore, jobs, worker profiles, businesses — which are the platform's
    // public, crawlable content (ACC-01) and set their own indexable metadata.
    // A layout-level noindex would silently deindex every one of them. The
    // private surfaces are excluded at the crawler level in robots.ts instead
    // (SRS §26.4), and sensitive routes carry their own per-route noindex.
  };
}

/**
 * Theme-colour follows the actual app background per scheme rather than the
 * brand Indigo, so the installed PWA's browser chrome blends into the page
 * instead of drawing a coloured stripe above it. The manifest keeps Indigo as
 * `theme_color` — that one is the brand identity in the OS task switcher, a
 * different job (SYS-01).
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#1b1e2e' },
  ],
};

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const basePath = `/${locale}/app`;

  return (
    <MotionProvider profile="app">
      {/* Next hoists these into <head>. They cannot go through the Metadata API:
          `apple-touch-startup-image` needs a per-device `media` attribute, which
          that API has no expression for. */}
      {SPLASH_SPECS.map((spec) => (
        <link
          key={`${spec.width}x${spec.height}@${spec.ratio}`}
          rel="apple-touch-startup-image"
          href={splashHref(basePath, spec)}
          media={splashMedia(spec)}
        />
      ))}

      <SkipLink />
      <ServiceWorkerRegister locale={locale} />
      {/* The chosen browsing location is shared by every discovery surface
          (DIS-09), so it lives at the shell rather than per screen — two screens
          holding their own copy is how a feed and a search end up disagreeing
          about where the user is. */}
      <LocationProvider>
        <div className="flex min-h-dvh flex-col">
          <AppHeader />
          {/* Sits between header and content so it displaces the page rather
              than covering it — an indicator that overlaps what it is warning
              you about is a poor warning (SYS-02). */}
          <OfflineIndicator />
          <main id="main" className="flex-1">
            {/* Animates the whole surface when the active role changes (ACC-07). */}
            <RoleTransition>
              <PageTransition>{children}</PageTransition>
            </RoleTransition>
          </main>
          <AppBottomNav />
        </div>
        <InstallPrompt />
      </LocationProvider>
    </MotionProvider>
  );
}
