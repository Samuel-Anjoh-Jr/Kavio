import { routing } from '@/i18n/routing';
import { normalizeEnvUrl } from '@/lib/env-url';

/**
 * The single source of the site's ENTITY facts — the things Google's Knowledge
 * Graph and, increasingly, an LLM answering "what is Kavio" both read from
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

export const SITE_URL = normalizeEnvUrl(process.env.NEXT_PUBLIC_SITE_URL, 'http://localhost:3000');

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
 * Cities used for `areaServed`, the geo meta tags, and local-intent AI answers
 * ("verified electrician in Douala"). Kavio is not scoped to two towns: workers
 * and clients anywhere in Cameroon can use the platform today, and this list
 * covers multiple cities in every one of Cameroon's 10 regions so search and AI
 * answer engines resolve local intent nationwide, not just for the two launch
 * cities. Verified worker density varies by city and grows over time; that
 * operational detail belongs in the FAQ, not in the entity facts every page
 * emits.
 *
 * Index 0 is the primary/founding location (`foundingLocation`, the ICBM geo
 * meta tag): Yaoundé. Order otherwise carries no meaning; every entry maps into
 * `areaServed` the same way.
 */
export const SERVICE_AREAS = [
  { name: 'Yaoundé', slug: 'yaounde', region: 'Centre', latitude: 3.848, longitude: 11.5021 },
  { name: 'Douala', slug: 'douala', region: 'Littoral', latitude: 4.0511, longitude: 9.7679 },
  {
    name: 'Bafoussam',
    slug: 'bafoussam',
    region: 'West',
    latitude: 5.4737,
    longitude: 10.4179,
  },
  {
    name: 'Bamenda',
    slug: 'bamenda',
    region: 'Northwest',
    latitude: 5.9631,
    longitude: 10.1591,
  },
  { name: 'Garoua', slug: 'garoua', region: 'North', latitude: 9.3017, longitude: 13.3921 },
  { name: 'Maroua', slug: 'maroua', region: 'Far North', latitude: 10.591, longitude: 14.3159 },
  {
    name: 'Ngaoundéré',
    slug: 'ngaoundere',
    region: 'Adamawa',
    latitude: 7.3167,
    longitude: 13.5833,
  },
  { name: 'Bertoua', slug: 'bertoua', region: 'East', latitude: 4.5776, longitude: 13.6846 },
  { name: 'Ebolowa', slug: 'ebolowa', region: 'South', latitude: 2.9, longitude: 11.15 },
  { name: 'Buea', slug: 'buea', region: 'Southwest', latitude: 4.156, longitude: 9.292 },
  { name: 'Limbe', slug: 'limbe', region: 'Southwest', latitude: 4.0227, longitude: 9.2148 },
  { name: 'Kribi', slug: 'kribi', region: 'South', latitude: 2.9375, longitude: 9.9074 },
  { name: 'Edéa', slug: 'edea', region: 'Littoral', latitude: 3.7981, longitude: 10.1319 },
  {
    name: 'Nkongsamba',
    slug: 'nkongsamba',
    region: 'Littoral',
    latitude: 4.9547,
    longitude: 9.9403,
  },
  { name: 'Dschang', slug: 'dschang', region: 'West', latitude: 5.4415, longitude: 10.0536 },
  { name: 'Foumban', slug: 'foumban', region: 'West', latitude: 5.7263, longitude: 10.9022 },
  { name: 'Kumba', slug: 'kumba', region: 'Southwest', latitude: 4.6363, longitude: 9.447 },
  { name: 'Kumbo', slug: 'kumbo', region: 'Northwest', latitude: 6.2, longitude: 10.6667 },
  { name: 'Mbalmayo', slug: 'mbalmayo', region: 'Centre', latitude: 3.5167, longitude: 11.5 },
  { name: 'Bafia', slug: 'bafia', region: 'Centre', latitude: 4.75, longitude: 11.2333 },
  {
    name: 'Sangmélima',
    slug: 'sangmelima',
    region: 'South',
    latitude: 2.9333,
    longitude: 11.9833,
  },
  { name: 'Guider', slug: 'guider', region: 'North', latitude: 9.9333, longitude: 13.95 },
  { name: 'Meiganga', slug: 'meiganga', region: 'Adamawa', latitude: 6.5167, longitude: 14.3 },
  {
    name: 'Kousséri',
    slug: 'kousseri',
    region: 'Far North',
    latitude: 12.0833,
    longitude: 15.0333,
  },
  {
    name: 'Abong-Mbang',
    slug: 'abong-mbang',
    region: 'East',
    latitude: 3.9833,
    longitude: 13.1833,
  },
] as const;

/** Looks up a service area by its URL slug, for a locale-agnostic city landing page. */
export function findServiceAreaBySlug(slug: string): (typeof SERVICE_AREAS)[number] | undefined {
  return SERVICE_AREAS.find((area) => area.slug === slug);
}

/**
 * The top-level trades a city × trade SEO page is generated for (PROMPT rec:
 * competitive-analysis §3). Mirrors `TOP_CATEGORIES` in
 * packages/database/prisma/seed.mjs — kept as a small hardcoded list here
 * rather than a live query for the same reason SERVICE_AREAS is: page
 * ENUMERATION (which routes exist, their nav/metadata copy) must survive a
 * build with no API reachable, while the LIVE content on each page (worker
 * count, sample profiles) still comes from a real, gracefully-degrading
 * GraphQL read. Update both lists together if a top-level trade is added.
 */
export const SERVICE_TRADES = [
  { slug: 'plumbing', nameEn: 'Plumbing', nameFr: 'Plomberie' },
  { slug: 'electrical', nameEn: 'Electrical', nameFr: 'Électricité' },
  { slug: 'carpentry', nameEn: 'Carpentry', nameFr: 'Menuiserie' },
  { slug: 'painting', nameEn: 'Painting', nameFr: 'Peinture' },
  { slug: 'cleaning', nameEn: 'Cleaning', nameFr: 'Nettoyage' },
  { slug: 'gardening', nameEn: 'Gardening', nameFr: 'Jardinage' },
  { slug: 'moving', nameEn: 'Moving', nameFr: 'Déménagement' },
  { slug: 'security', nameEn: 'Security', nameFr: 'Sécurité' },
  { slug: 'appliance-repair', nameEn: 'Appliance Repair', nameFr: 'Réparation d’Électroménager' },
  { slug: 'masonry', nameEn: 'Masonry', nameFr: 'Maçonnerie' },
  { slug: 'tiling', nameEn: 'Tiling', nameFr: 'Carrelage' },
  { slug: 'welding', nameEn: 'Welding', nameFr: 'Soudure' },
] as const;

/** Looks up a trade by its URL slug. */
export function findServiceTradeBySlug(slug: string): (typeof SERVICE_TRADES)[number] | undefined {
  return SERVICE_TRADES.find((trade) => trade.slug === slug);
}

/** Cities pre-rendered at build time for every trade (PROMPT rec: §3). Every
 * OTHER city × trade combination still resolves on first request and is then
 * ISR-cached — `dynamicParams` stays at its default `true` — so the full grid
 * becomes real, crawlable pages without a 288-page build.
 */
export const SEO_LANDING_BUILD_CITY_SLUGS = [
  'yaounde',
  'douala',
  'bafoussam',
  'bamenda',
  'garoua',
  'maroua',
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
