import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { MotionProvider } from '@/components/motion/motion-provider';
import { PageTransition } from '@/components/motion/page-transition';
import { SmoothScroll } from '@/components/motion/smooth-scroll';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SkipLink } from '@/components/a11y/skip-link';

/**
 * Marketing route group: strong staggered reveals (via Reveal) + Lenis smooth
 * scroll, both scoped to this group only (SRS §20.4). The marketing landing
 * page is also excluded from the PWA service-worker scope — enforced by this
 * group never mounting ServiceWorkerRegister, so the browser gives it no
 * controller (CLAUDE.md ACCESS MODEL).
 *
 * Header and footer render on every customer-facing marketing page (SRS §26.2
 * "Layout groups"). The header carries the section nav and the single entry CTA;
 * the footer carries the legal pages. Neither carries an admin or agent link —
 * that omission is the landing-hygiene requirement (SRS §26.6).
 *
 * `setRequestLocale` is called HERE, not only in the pages, because the header
 * and footer this layout renders are themselves translated. Without it, next-intl
 * cannot resolve their strings at build time and silently opts the whole group
 * into DYNAMIC rendering — which would break SYS-05 ("public pages static/ISR")
 * for the signature landing page and the legal pages alike.
 */
export default async function MarketingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <MotionProvider profile="marketing">
      <SkipLink />
      <SiteHeader />
      <SmoothScroll>
        {/* `main` is the skip-link target and the one landmark a screen-reader
            user tabs to first (NFR-A11Y-01). */}
        <main id="main">
          <PageTransition>{children}</PageTransition>
        </main>
      </SmoothScroll>
      <SiteFooter />
    </MotionProvider>
  );
}
