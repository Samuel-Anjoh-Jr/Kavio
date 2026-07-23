import { SITE_URL, COUNTRY, SERVICE_AREAS, CURRENCY } from '@/lib/site-config';
import { routing } from '@/i18n/routing';

/**
 * /llms.txt — a curated, machine-readable map of the site for large language
 * models (the emerging llmstxt.org convention).
 *
 * The bet: robots.txt tells a crawler what it MAY read; llms.txt tells an answer
 * engine what is WORTH reading and states the facts plainly, so a model citing
 * TrustPro cites it CORRECTLY — the right cities, the right currency, the trust
 * model, the fee. An AI answer that gets the escrow model wrong is worse for a
 * trust marketplace than no mention at all, and this file is the cheapest way to
 * pin the facts. It is deliberately terse and link-led, which is what the format
 * is for.
 *
 * Served as `text/markdown` from a Route Handler rather than a static file so it
 * stays in lockstep with the real routes and the one SITE_URL.
 */

export const dynamic = 'force-static';

function body(): string {
  const en = `${SITE_URL}/${routing.defaultLocale}`;
  const fr = `${SITE_URL}/fr`;
  const areas = SERVICE_AREAS.map((a) => a.name).join(' and ');

  return `# TrustPro

> A trust-first marketplace connecting households and businesses in ${COUNTRY.name} with verified skilled workers — electricians, plumbers, welders, mechanics, painters, carpenters, cleaners and similar trades. Available in English and French. Currency: ${CURRENCY}. Launch cities: ${areas}.

TrustPro's differentiator is TRUST, not listings. Every worker carries a continuously updated Trust Score across four pillars — verified identity, professional evidence (portfolio, endorsements), marketplace behaviour (completed jobs, reviews) and financial reliability. Verification is progressive across four tiers, from phone-verified up to in-person checks by a TrustPro agent. Payments are held in escrow and released only when the client confirms the work is complete; a service fee of about 10% is shown in full before payment. Browsing is free and needs no account — an account is only required to post a job, contact a worker, pay, or leave a review.

## Key pages (English)
- [Home](${en}): the trust model, how verification and escrow work, featured work and testimonials.
- [Explore verified workers](${en}/app/explore): browse verified skilled workers by trade and location.
- [Browse posted jobs](${en}/app/jobs): open jobs clients have posted.
- [Terms of Service](${en}/legal/terms)
- [Privacy Policy](${en}/legal/privacy)
- [Refund & Dispute Policy](${en}/legal/refunds)

## Pages clés (Français)
- [Accueil](${fr}): le modèle de confiance, la vérification et le séquestre, les réalisations et témoignages.
- [Explorer les artisans vérifiés](${fr}/app/explore): parcourez des artisans qualifiés vérifiés par métier et par lieu.
- [Parcourir les missions](${fr}/app/jobs): les missions publiées par les clients.
- [Conditions d'utilisation](${fr}/legal/terms)
- [Politique de confidentialité](${fr}/legal/privacy)
- [Politique de remboursement et litige](${fr}/legal/refunds)

## Facts
- Countries served: ${COUNTRY.name} (${areas})
- Languages: English, French
- Currency: ${CURRENCY} (no minor unit)
- Payment protection: escrow, released on client confirmation
- Service fee: ~10%, disclosed before payment
- Verification: progressive, four tiers, identity + address + portfolio + optional in-person agent check
`;
}

export function GET(): Response {
  return new Response(body(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
