'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { NAV_SECTIONS } from '@/lib/marketing-sections';
import { trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';
import { cn } from '@/lib/utils';

/**
 * The marketing header (SRS §26.2 "Navigation").
 *
 * Transparent over the hero, solid + blurred past ~60px, on a 200–300ms
 * transition. Nav links derive from the single MARKETING_SECTIONS constant, so
 * a section renamed in one place cannot leave a link scrolling nowhere.
 *
 * The mobile menu is a Radix Dialog rather than a hand-rolled panel. That is not
 * about markup convenience: a drawer must trap focus, close on ESC, restore
 * focus to the trigger, and hide the rest of the page from assistive tech —
 * four things Radix does correctly and a bespoke panel almost never does
 * (NFR-A11Y-01).
 *
 * NO ADMIN OR AGENT ENTRY POINTS appear here, deliberately (SRS §26.6 landing
 * hygiene). Internal workflow logins on a conversion surface are both a
 * distraction from the one action that matters and a free map of the platform's
 * privileged routes.
 */
export function SiteHeader() {
  const t = useTranslations('Marketing.nav');
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const scrolledRef = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 60;
      // Only re-render on a state CHANGE, not on every scroll frame.
      if (next !== scrolledRef.current) {
        scrolledRef.current = next;
        setScrolled(next);
      }
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const sections = NAV_SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      // The band sits below the header and above the fold's end, so the
      // "current" section is the one actually being read.
      { rootMargin: '-20% 0px -70% 0px', threshold: [0.1, 0.5, 1] },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const navLinks = NAV_SECTIONS.map((section) => (
    <a
      key={section.id}
      href={`#${section.id}`}
      onClick={() => setMenuOpen(false)}
      aria-current={active === section.id ? 'true' : undefined}
      className={cn(
        'rounded-button px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active === section.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {t(section.labelKey)}
    </a>
  ));

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-250',
        scrolled ? 'bg-background/85 shadow-sm backdrop-blur-md' : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-button focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src="/brand/kavio-mark.png"
            alt=""
            aria-hidden="true"
            width={480}
            height={369}
            priority
            className="h-8 w-auto"
          />
          <span className="font-heading text-lg font-semibold text-foreground">Kavio</span>
        </Link>

        <nav aria-label={t('primary')} className="hidden items-center gap-1 md:flex">
          {navLinks}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1 sm:flex">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>

          {/* Accent on the primary CTA — the 10% of 60/30/10 (BRAND_GUIDELINES.md). */}
          <Button asChild variant="accent" size="sm" className="hidden sm:inline-flex">
            <Link
              href="/app/home"
              onClick={() =>
                trackEvent(ANALYTICS_EVENTS.LANDING_CTA_CLICK, { placement: 'header' })
              }
            >
              {t('cta')}
            </Link>
          </Button>

          <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Dialog.Trigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('openMenu')}>
                <Menu aria-hidden="true" />
              </Button>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-neutral-900/40 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in" />
              <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-72 flex-col gap-2 bg-surface p-6 shadow-lg motion-safe:animate-in motion-safe:slide-in-from-right">
                <div className="flex items-center justify-between">
                  <Dialog.Title className="font-heading text-base font-semibold text-surface-foreground">
                    {t('menu')}
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" aria-label={t('closeMenu')}>
                      <X aria-hidden="true" />
                    </Button>
                  </Dialog.Close>
                </div>

                <Dialog.Description className="sr-only">{t('menuDescription')}</Dialog.Description>

                <nav aria-label={t('primary')} className="flex flex-col gap-1 pt-2">
                  {navLinks}
                </nav>

                <div className="mt-auto flex flex-col gap-3">
                  <div className="flex items-center gap-1">
                    <LocaleSwitcher />
                    <ThemeToggle />
                  </div>
                  <Button asChild variant="accent">
                    <Link
                      href="/app/home"
                      onClick={() =>
                        trackEvent(ANALYTICS_EVENTS.LANDING_CTA_CLICK, { placement: 'mobile-menu' })
                      }
                    >
                      {t('cta')}
                    </Link>
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
