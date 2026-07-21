import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { MotionProvider } from '@/components/motion/motion-provider';
import { PageTransition } from '@/components/motion/page-transition';
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register';

/**
 * App shell segment (`/{locale}/app/...`): minimal motion, no Lenis (native
 * scroll for dense, data-heavy surfaces per CLAUDE.md §26.2 "app/admin
 * surfaces stay minimal"). This is also the ONLY segment that links a PWA
 * manifest, registers the service worker, and sets an app theme-color — the
 * marketing route group deliberately does none of this, so it is never
 * installable and never controlled by the service worker (PROMPT 18).
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
      <PageTransition>{children}</PageTransition>
    </MotionProvider>
  );
}
