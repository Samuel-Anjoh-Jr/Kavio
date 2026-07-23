import { routing } from '@/i18n/routing';

/**
 * The single source of the site's ENTITY facts — the things Google's Knowledge
 * Graph and, increasingly, an LLM answering "what is TrustPro" both read from
 * (PROMPTS 93, 93.1; SRS §26.4/§26.6).
 *
 * Why this exists as one module: modern search and AI answer engines resolve a
 * brand to an ENTITY, not a keyword. The name, the place it serves, the
 * languages it speaks and the profiles that corroborate it must be stated
 * identically in the page metadata, the JSON-LD, the sitemap and the llms.txt —
 * a discrepancy between any two of them is a signal of a low-confidence entity,
 * and low-confidence entities do not get cited. One const, quoted everywhere.
 *
 * NOTHING here is fabricated. Social profiles and verification tokens are read
 * from env and OMITTED when unset, because a `sameAs` pointing at a profile that
 * 404s is worse for trust than no `sameAs` at all.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);

/** BCP-47 tags for the two supported languages, region-qualified for Cameroon. */
export const LOCALE_TAGS: Record<string, string> = {
  en: 'en-CM',
  fr: 'fr-CM',
};

/** OpenGraph locale tokens (underscore form). */
export const OG_LOCALES: Record<string, string> = {
  en: 'en_CM',
  fr: 'fr_CM',
};

export function localeTag(locale: string): string {
  return LOCALE_TAGS[locale] ?? locale;
}

/**
 * The cities served, with real coordinates. Used for `areaServed`, the geo meta
 * tags, and local-intent AI answers ("verified electrician in Douala"). These
 * are facts about the launch market (SRS §1.2), not marketing copy, so they live
 * here rather than in the translation catalogue.
 */
export const SERVICE_AREAS = [
  { name: 'Douala', region: 'Littoral', latitude: 4.0511, longitude: 9.7679 },
  { name: 'Yaoundé', region: 'Centre', latitude: 3.848, longitude: 11.5021 },
] as const;

export const COUNTRY = { name: 'Cameroon', code: 'CM' } as const;

/** The currency the whole marketplace transacts in (CLAUDE.md: XAF only). */
export const CURRENCY = 'XAF';

/**
 * Corroborating profiles for the Organization entity's `sameAs`. Env-driven and
 * filtered to the ones actually set — see the module note on why we never
 * fabricate these. Set NEXT_PUBLIC_SOCIAL_* per environment as the accounts go
 * live.
 */
export function socialProfiles(): string[] {
  return [
    process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK,
    process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM,
    process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN,
    process.env.NEXT_PUBLIC_SOCIAL_X,
    process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE,
  ].filter((url): url is string => Boolean(url));
}

/** The X/Twitter handle for `twitter:site`, or undefined when unconfigured. */
export function twitterHandle(): string | undefined {
  return process.env.NEXT_PUBLIC_TWITTER_HANDLE || undefined;
}

/**
 * Search-console / AI verification tokens, env-driven. Returned in the shape
 * Next's Metadata `verification` field expects, omitting anything unset.
 */
export function verificationTokens(): { google?: string; other?: Record<string, string> } {
  const google = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined;
  const bing = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || undefined;

  const other: Record<string, string> = {};
  if (bing) other['msvalidate.01'] = bing;

  return {
    ...(google ? { google } : {}),
    ...(Object.keys(other).length > 0 ? { other } : {}),
  };
}

/** The site's own logo URL (the generated 512 PWA icon, one source of the mark). */
export function logoUrl(locale: string = routing.defaultLocale): string {
  return `${SITE_URL}/${locale}/app/icons/512`;
}

/** Absolute URL to a locale's default social-preview image. */
export function ogImageUrl(locale: string): string {
  return `${SITE_URL}/${locale}/opengraph-image`;
}
