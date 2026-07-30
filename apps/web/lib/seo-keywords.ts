import { SERVICE_AREAS } from './site-config';

/**
 * The keywords meta tag has near-zero weight with Google (confirmed dead as a
 * ranking signal since 2009) and only marginal use elsewhere (Bing, some AI
 * crawlers glance at it). It is kept here, generated rather than hand-typed,
 * because a generated list can safely be a little more thorough than a
 * hand-curated one without turning into keyword-stuffed nonsense that reads
 * badly to whatever DOES parse it, and because tying it to `SERVICE_AREAS`
 * means every new city Kavio adds is reflected here automatically, with no
 * separate translation-catalogue string to remember to update.
 *
 * The real local-SEO work is elsewhere: on-page content (the landing page's
 * "Where we work" section), structured data (`structured-data.ts`), and,
 * highest-leverage of all, indexable per-worker profile pages carrying their
 * own city + trade in the title and JSON-LD (see `workers/[id]/page.tsx`).
 * This file is the low-cost, low-risk piece of the keyword story, not the
 * whole of it.
 */

/** Occupational search terms, mapped from the real catalogue's top-level trades. */
const TRADE_TERMS: Record<'en' | 'fr', string[]> = {
  en: [
    'electrician',
    'plumber',
    'carpenter',
    'painter',
    'cleaner',
    'gardener',
    'mover',
    'security guard',
    'appliance repair technician',
    'mason',
    'tiler',
    'welder',
  ],
  fr: [
    'électricien',
    'plombier',
    'menuisier',
    'peintre',
    'agent d’entretien',
    'jardinier',
    'déménageur',
    'agent de sécurité',
    'technicien réparation électroménager',
    'maçon',
    'carreleur',
    'soudeur',
  ],
};

/** Curated, brand/product-level terms, not city-specific, kept short on purpose. */
const CORE_KEYWORDS: Record<'en' | 'fr', string[]> = {
  en: [
    'verified workers Cameroon',
    'skilled labour nationwide Cameroon',
    'hire artisan Cameroon',
    'escrow payment Cameroon',
    'Trust Score',
    'local services Cameroon',
    'home services Cameroon',
  ],
  fr: [
    'artisans vérifiés Cameroun',
    'main-d’œuvre qualifiée partout au Cameroun',
    'engager artisan Cameroun',
    'paiement sous séquestre Cameroun',
    'Score de Confiance',
    'services locaux Cameroun',
    'services à domicile Cameroun',
  ],
};

/**
 * One keyword phrase per trade, each paired with a different city (round-robin
 * over `SERVICE_AREAS`, so every trade gets a distinct city rather than the
 * launch two repeating twelve times) plus one phrase naming every city Kavio
 * lists, the "all these areas" entry a spot-check of this file should find.
 */
export function seoKeywords(locale: 'en' | 'fr'): string[] {
  const trades = TRADE_TERMS[locale];
  const tradeCityCombos = trades.map(
    (trade, index) => `${trade} ${SERVICE_AREAS[index % SERVICE_AREAS.length]!.name}`,
  );
  const allCities = SERVICE_AREAS.map((area) => area.name).join(', ');
  const nationwidePhrase =
    locale === 'fr' ? `services locaux à ${allCities}` : `local services in ${allCities}`;

  return [...CORE_KEYWORDS[locale], ...tradeCityCombos, nationwidePhrase];
}
