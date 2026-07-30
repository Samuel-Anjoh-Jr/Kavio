import {
  COUNTRY,
  CURRENCY,
  SERVICE_AREAS,
  SITE_URL,
  localeTag,
  logoUrl,
  socialProfiles,
} from '@/lib/site-config';

/**
 * JSON-LD structured data (SYS-05; SRS §26.4/§26.6).
 *
 * Built as a single linked `@graph` with `@id` anchors rather than a pile of
 * disconnected blocks. That is the load-bearing decision here: a search engine —
 * and now an answer engine — resolves a brand to an ENTITY, and an entity is
 * only as strong as the links between its facts. When the WebSite cites the
 * Organization as its publisher, the WebPage declares itself part of the
 * WebSite, and the FAQ hangs off the WebPage, the crawler reads one confident
 * entity instead of four loose assertions. Loose assertions do not get cited in
 * AI answers; linked ones do.
 *
 * Everything is localized: each node carries `inLanguage`, and human-readable
 * text is passed in already translated by the caller (from the next-intl
 * catalogue), so the FR page emits FR structured data and the EN page EN — full
 * parity, not an English graph bolted onto a French page.
 */

const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

type JsonLdNode = Record<string, unknown>;

/** Stable @id for a page's WebPage node. */
function webPageId(url: string): string {
  return `${url}#webpage`;
}

/**
 * The Organization entity — the anchor every other node points at.
 *
 * `knowsAbout` lists the trades the platform is authoritative on: it is a direct
 * topical-relevance signal, telling an answer engine that "Kavio" is a
 * sensible entity to cite for "verified electrician in Douala". `areaServed`
 * carries real City nodes with coordinates so local intent resolves. `sameAs`
 * is corroboration — and is empty rather than fabricated when no profiles are
 * configured (see site-config).
 */
export function organizationNode(options: {
  locale: string;
  description: string;
  slogan?: string;
  knowsAbout?: string[];
}): JsonLdNode {
  const { locale, description, slogan, knowsAbout } = options;
  const social = socialProfiles();

  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'Kavio',
    url: `${SITE_URL}/${locale}`,
    logo: {
      '@type': 'ImageObject',
      url: logoUrl(locale),
      width: 512,
      height: 512,
    },
    image: logoUrl(locale),
    description,
    ...(slogan ? { slogan } : {}),
    foundingLocation: {
      '@type': 'Place',
      name: `${SERVICE_AREAS[0].name}, ${COUNTRY.name}`,
    },
    areaServed: [
      { '@type': 'Country', name: COUNTRY.name },
      ...SERVICE_AREAS.map((area) => ({
        '@type': 'City',
        name: area.name,
        geo: {
          '@type': 'GeoCoordinates',
          latitude: area.latitude,
          longitude: area.longitude,
        },
        containedInPlace: { '@type': 'Country', name: COUNTRY.name },
      })),
    ],
    knowsLanguage: ['en-CM', 'fr-CM'],
    ...(knowsAbout && knowsAbout.length > 0 ? { knowsAbout } : {}),
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      availableLanguage: ['English', 'French'],
      areaServed: COUNTRY.code,
    },
    ...(social.length > 0 ? { sameAs: social } : {}),
  };
}

/**
 * The WebSite node, with a SearchAction that can earn a sitelinks search box and
 * tells an answer engine the site is searchable (and where). The target is the
 * clean guest-discovery URL — the one public surface a query actually resolves
 * against.
 */
export function websiteNode(options: { locale: string; description: string }): JsonLdNode {
  const { locale, description } = options;

  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${SITE_URL}/${locale}`,
    name: 'Kavio',
    description,
    inLanguage: localeTag(locale),
    publisher: { '@id': ORG_ID },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/${locale}/app/explore?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * The WebPage node, tying a specific page into the WebSite and Organization.
 * `speakable` marks which parts a voice assistant may read aloud — an explicit
 * hint that this content is answer-shaped.
 */
export function webPageNode(options: {
  locale: string;
  url: string;
  title: string;
  description: string;
  breadcrumbId?: string;
  primary?: boolean;
}): JsonLdNode {
  const { locale, url, title, description, breadcrumbId, primary } = options;

  return {
    '@type': 'WebPage',
    '@id': webPageId(url),
    url,
    name: title,
    description,
    inLanguage: localeTag(locale),
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': ORG_ID },
    ...(breadcrumbId ? { breadcrumb: { '@id': breadcrumbId } } : {}),
    ...(primary
      ? {
          speakable: {
            '@type': 'SpeakableSpecification',
            cssSelector: ['h1', 'h2'],
          },
        }
      : {}),
  };
}

/**
 * FAQPage from the real, on-page questions. The FAQ is the platform's most
 * directly answer-engine-friendly content — a literal list of question/answer
 * pairs — so it is emitted as its own node and carries `inLanguage`. Answers are
 * plain text (Markdown stripped by the caller) because a rich result renders
 * them as text, not HTML.
 */
export function faqPageNode(options: {
  locale: string;
  url: string;
  questions: { question: string; answer: string }[];
}): JsonLdNode {
  const { locale, url, questions } = options;

  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    inLanguage: localeTag(locale),
    isPartOf: { '@id': webPageId(url) },
    mainEntity: questions.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    })),
  };
}

/** A BreadcrumbList from ordered { name, path } items (locale-prefixed URLs). */
export function breadcrumbNode(options: {
  locale: string;
  url: string;
  items: { name: string; path: string }[];
}): JsonLdNode {
  const { locale, url, items } = options;

  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}/${locale}${item.path === '/' ? '' : item.path}`,
    })),
  };
}

/**
 * The marketplace itself as a Service, so "hire a verified plumber in Cameroon"
 * has a Service entity to match. `areaServed`, `provider`, and a priced
 * (fee-bearing) offer give an answer engine the shape of what Kavio actually
 * does.
 */
export function serviceNode(options: {
  locale: string;
  name: string;
  description: string;
  categories?: string[];
}): JsonLdNode {
  const { locale, name, description, categories } = options;

  return {
    '@type': 'Service',
    '@id': `${SITE_URL}/#service`,
    serviceType: name,
    name,
    description,
    inLanguage: localeTag(locale),
    provider: { '@id': ORG_ID },
    areaServed: [
      { '@type': 'Country', name: COUNTRY.name },
      ...SERVICE_AREAS.map((area) => ({ '@type': 'City', name: area.name })),
    ],
    availableChannel: {
      '@type': 'ServiceChannel',
      serviceUrl: `${SITE_URL}/${locale}/app/explore`,
      availableLanguage: ['en-CM', 'fr-CM'],
    },
    offers: {
      '@type': 'Offer',
      priceCurrency: CURRENCY,
      description,
    },
    ...(categories && categories.length > 0
      ? { category: categories, serviceOutput: categories }
      : {}),
  };
}

/**
 * An individual worker's public profile, as a `LocalBusiness` (SRS §26.4/§26.6).
 *
 * `Person` was the more obvious type here and was deliberately rejected: Google
 * only renders the star-rating rich result for a fixed list of types, and
 * `Person` is not on it, while `LocalBusiness` is. A sole-trader worker on a
 * services marketplace genuinely IS the business, so this is not a stretch of
 * the type, and it is the one modelling choice that makes a worker's Trust
 * Score and rating eligible to show up as stars in a search result rather than
 * a plain blue link.
 *
 * `aggregateRating` is included ONLY when the caller passes a real
 * `reviewCount` backing the rating (`reviews.ratedJobCount` from the profile
 * query), never a proxy like total completed jobs. Structured data that
 * overstates what the page visibly shows is exactly what draws a manual
 * action for spammy markup, and this page does not yet list individual
 * written reviews, so the count must be the one the visible rating is
 * actually drawn from.
 */
export function localBusinessNode(options: {
  url: string;
  name: string;
  description: string;
  image?: string | null;
  trade?: string | null;
  city?: string | null;
  region?: string | null;
  ratingValue?: number | null;
  reviewCount?: number | null;
}): JsonLdNode {
  const { url, name, description, image, trade, city, region, ratingValue, reviewCount } = options;

  return {
    '@type': 'LocalBusiness',
    '@id': `${url}#business`,
    name,
    description,
    ...(image ? { image } : {}),
    ...(trade ? { knowsAbout: [trade] } : {}),
    ...(city
      ? {
          address: {
            '@type': 'PostalAddress',
            addressLocality: city,
            ...(region ? { addressRegion: region } : {}),
            addressCountry: COUNTRY.code,
          },
          areaServed: { '@type': 'City', name: city },
        }
      : {}),
    ...(ratingValue && reviewCount
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue,
            reviewCount,
          },
        }
      : {}),
  };
}

/** Wraps nodes into one `@graph` document. */
export function graph(nodes: JsonLdNode[]): JsonLdNode {
  return { '@context': 'https://schema.org', '@graph': nodes };
}
