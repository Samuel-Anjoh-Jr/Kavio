/**
 * The landing page's sections, in page order (SRS §26.2 "Navigation").
 *
 * ONE constant, 1:1 with the real section ids and in the same order as the
 * page. The nav links derive from this rather than being written out again in
 * the header, because a hand-maintained nav is how a site ends up with a link
 * that scrolls nowhere — the failure is silent, and nobody clicks their own nav.
 *
 * `labelKey` is a next-intl key, never a string: no hardcoded user-facing copy
 * (SYS-03).
 */
export interface MarketingSection {
  id: string;
  labelKey: string;
  /** False for sections that exist on the page but do not deserve a nav slot. */
  inNav: boolean;
}

export const MARKETING_SECTIONS: MarketingSection[] = [
  { id: 'hero', labelKey: 'hero', inNav: false },
  { id: 'trust-engine', labelKey: 'trustEngine', inNav: true },
  { id: 'portfolio', labelKey: 'portfolio', inNav: true },
  { id: 'pricing', labelKey: 'pricing', inNav: true },
  { id: 'testimonials', labelKey: 'testimonials', inNav: true },
  { id: 'faq', labelKey: 'faq', inNav: true },
];

export const NAV_SECTIONS = MARKETING_SECTIONS.filter((section) => section.inNav);
