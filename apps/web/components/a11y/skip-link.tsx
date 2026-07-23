'use client';

import { useTranslations } from 'next-intl';

/**
 * "Skip to main content" (NFR-A11Y-01: keyboard operability).
 *
 * Visually hidden until focused, then the first thing the Tab key reaches. It is
 * what lets a keyboard or screen-reader user jump the entire header nav on every
 * page instead of tabbing through it each time — one of the most concrete WCAG
 * 2.1 requirements and one of the most commonly skipped.
 *
 * The target `#main` is a real landmark rendered by each layout. This must come
 * before the header in the DOM so it is genuinely first in the tab order, which
 * is why it lives at the very top of the layout rather than inside the nav.
 */
export function SkipLink() {
  const t = useTranslations('A11y');

  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-button focus:bg-primary focus:px-4 focus:py-2 focus:font-medium focus:text-primary-foreground focus:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {t('skipToContent')}
    </a>
  );
}
