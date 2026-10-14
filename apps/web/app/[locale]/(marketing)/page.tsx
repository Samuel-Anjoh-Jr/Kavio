import { Fragment } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';
import { Magnetic } from '@/components/motion/magnetic';
import { TrustRecord } from '@/components/marketing/trust-record';
import { SurveyProof } from '@/components/marketing/survey-proof';
import { TrustEngineStory } from '@/components/marketing/trust-engine-story';
import { EscrowFlow } from '@/components/marketing/escrow-flow';
import { BeforeAfterCard } from '@/components/marketing/before-after-card';
import { TestimonialMarquee } from '@/components/marketing/testimonial-marquee';
import { FaqSection } from '@/components/marketing/faq-section';
import { LandingAnalytics } from '@/components/marketing/landing-analytics';
import { StarRating } from '@/components/ui/star-rating';
import { JsonLd } from '@/components/seo/json-ld';
import { localised } from '@/lib/graphql/marketing';
import { buildMetadata, canonicalFor } from '@/lib/seo';
import { seoKeywords } from '@/lib/seo-keywords';
import { SERVICE_AREAS } from '@/lib/site-config';
import { cssVars } from '@/lib/utils';
import {
  faqPageNode,
  graph,
  organizationNode,
  serviceNode,
  webPageNode,
  websiteNode,
} from '@/lib/structured-data';
import { routing } from '@/i18n/routing';
import { loadMarketingContent } from './load-marketing-content';

/**
 * Strips the light Markdown FAQ answers carry (links, bold, italic) down to
 * plain text for the FAQPage schema — a rich result renders answer text, not
 * HTML, and a stray `[label](url)` in a structured-data string reads as noise to
 * a crawler.
 */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The signature landing page (SYS-05, SRS §20.6).
 *
 * The page tells the trust story IN ORDER as you scroll: a claim and the record
 * that backs it (hero), why these signals (the survey the product was built
 * from), how the score is actually earned (Trust Engine), proof of work
 * (portfolio), how the money is protected (escrow), who says so
 * (testimonials), the objections (FAQ), where it works (areas), and one way in
 * (CTA). Section order is the argument, which is why the nav reads its anchors
 * from one constant. Design direction: DESIGN.md at the repo root.
 *
 * NOT controlled by the service worker: this route group never mounts
 * ServiceWorkerRegister, so the browser never gives it a controller and it stays
 * a fast, crawlable, SEO-first page (CLAUDE.md ACCESS MODEL).
 */

/** Statically rendered per locale — public pages are static/ISR (SYS-05). */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Revalidated hourly. The FAQ and testimonials are database-driven, so a fully
 * static build would freeze an admin's edit until the next deploy; `no-store`
 * would throw away the static rendering the performance budget depends on.
 */
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Marketing.meta' });

  return buildMetadata({
    locale,
    path: '/',
    title: t('title'),
    description: t('description'),
    keywords: seoKeywords(locale === 'fr' ? 'fr' : 'en'),
  });
}

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Marketing');
  const { faqs, testimonials, portfolio: portfolioRows } = await loadMarketingContent();

  const featured = testimonials[0];
  // The marquee loops, so it needs enough entries to not repeat faces every
  // few seconds; the featured quote leaves it only when there are plenty.
  const marqueeTestimonials = testimonials.length > 6 ? testimonials.slice(1) : testimonials;

  const heading = t('hero.heading');
  const headingWords = heading.split(' ');

  // Coverage grouped by region, in a fixed order, so the list reads as a map
  // of the country rather than a cloud of chips.
  const regions = REGION_ORDER.map((region) => ({
    ...region,
    cities: SERVICE_AREAS.filter((area) => area.region === region.name).map((area) => area.name),
  })).filter((region) => region.cities.length > 0);

  // Admin-managed via /app/admin/marketing (PortfolioShowcase) — already
  // published-only and in admin-chosen order from the resolver.
  const portfolio = portfolioRows.map((row) => ({
    trade: localised(row, 'trade', locale),
    caption: localised(row, 'caption', locale),
    beforeUrl: row.beforeUrl,
    afterUrl: row.afterUrl,
  }));

  /**
   * Structured data (SYS-05), as ONE linked @graph rather than loose blocks — see
   * lib/structured-data.ts for why the links are the point. Every node is derived
   * from what the page actually renders (the FAQ nodes come from the same `faqs`
   * the FAQ section shows), because structured data that describes content not on
   * the page is a manual-action risk, not an SEO win.
   */
  const url = canonicalFor(locale, '/');
  // The trades the platform is authoritative on, from the same rows the
  // portfolio rail renders — a topical-authority signal for `knowsAbout` (see
  // structured-data.ts) and the Service categories.
  const tradeCategories = portfolio.map((item) => item.trade);

  const structuredData = graph([
    organizationNode({
      locale,
      description: t('meta.description'),
      slogan: t('hero.heading'),
      knowsAbout: tradeCategories,
    }),
    websiteNode({ locale, description: t('meta.description') }),
    webPageNode({
      locale,
      url,
      title: t('meta.title'),
      description: t('meta.description'),
      primary: true,
    }),
    serviceNode({
      locale,
      name: t('meta.serviceName'),
      description: t('meta.description'),
      categories: tradeCategories,
    }),
    ...(faqs.length > 0
      ? [
          faqPageNode({
            locale,
            url,
            questions: faqs.map((faq) => ({
              question: localised(faq, 'question', locale),
              answer: toPlainText(localised(faq, 'answer', locale)),
            })),
          }),
        ]
      : []),
  ]);

  return (
    <>
      <JsonLd data={structuredData} />

      <LandingAnalytics />

      {/* ── Hero: the claim, and the record that backs it ─────────────────── */}
      <section
        id="hero"
        className="relative overflow-hidden px-4 pb-20 pt-10 sm:px-6 sm:pt-16 lg:pb-28"
      >
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <div className="flex flex-col gap-6">
            <p className="kv-enter text-sm font-medium text-muted-foreground">
              {t('hero.eyebrow')}
            </p>

            {/* Words rise from a mask at first paint (CSS, globals.css). The
                accessible name is the whole sentence, not word fragments. */}
            <h1
              aria-label={heading}
              className="text-balance font-heading text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-6xl lg:text-[4.25rem]"
            >
              {headingWords.map((word, index) => (
                <Fragment key={`${word}-${index}`}>
                  <span
                    aria-hidden="true"
                    className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-bottom"
                  >
                    <span
                      className="kv-word"
                      style={cssVars({ '--kv-delay': `${80 + index * 45}ms` })}
                    >
                      {word}
                    </span>
                  </span>
                  {index < headingWords.length - 1 ? ' ' : null}
                </Fragment>
              ))}
            </h1>

            <p
              className="kv-enter max-w-xl text-lg leading-relaxed text-muted-foreground"
              style={cssVars({ '--kv-delay': '350ms' })}
            >
              {t('hero.subheading')}
            </p>

            <div
              className="kv-enter flex flex-wrap items-center gap-3"
              style={cssVars({ '--kv-delay': '450ms' })}
            >
              {/* Accent on the one primary action (BRAND_GUIDELINES.md). */}
              <Magnetic>
                <Button asChild variant="accent" size="lg">
                  <Link href="/app/explore">
                    {t('hero.primaryCta')}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </Magnetic>
              <Button asChild variant="ghost" size="lg">
                <Link href="/auth/signup">{t('hero.secondaryCta')}</Link>
              </Button>
            </div>

            <p
              className="kv-enter text-sm text-muted-foreground"
              style={cssVars({ '--kv-delay': '520ms' })}
            >
              {t('hero.noAccountNote')}
            </p>
          </div>

          <TrustRecord />
        </div>
      </section>

      {/* ── Why these signals: the survey the product was built from ───────── */}
      <section
        aria-labelledby="proof-heading"
        className="border-y border-border bg-muted/50 px-4 py-20 sm:px-6 lg:py-24"
      >
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <Reveal className="flex flex-col gap-4">
            <h2
              id="proof-heading"
              className="text-balance font-heading text-3xl font-semibold tracking-[-0.01em] text-foreground sm:text-4xl"
            >
              {t('proof.heading')}
            </h2>
            <p className="max-w-md text-muted-foreground">{t('proof.body')}</p>
          </Reveal>

          <div className="flex flex-col gap-4">
            <SurveyProof />
            <p className="text-xs text-muted-foreground">{t('proof.source')}</p>
          </div>
        </div>
      </section>

      {/* ── Trust Engine: the score climbing as you read the stages ──────── */}
      <section id="trust-engine" className="px-4 py-20 sm:px-6 lg:py-28">
        <TrustEngineStory />
      </section>

      {/* ── Portfolio ────────────────────────────────────────────────────── */}
      {/* Admin-managed (PortfolioShowcase); hidden entirely rather than shown
          empty when nobody has published an entry yet. */}
      {portfolio.length > 0 && (
        <section id="portfolio" className="border-y border-border bg-muted/50 py-20 lg:py-28">
          <div className="px-4 sm:px-6">
            <div className="mx-auto max-w-6xl">
              <Reveal className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-16">
                <h2 className="text-balance font-heading text-3xl font-semibold tracking-[-0.01em] text-foreground sm:text-4xl">
                  {t('portfolio.heading')}
                </h2>
                <p className="max-w-lg text-muted-foreground">{t('portfolio.body')}</p>
              </Reveal>
            </div>
          </div>

          {/* Full-bleed rail whose first card lines up with the content column:
              the cards running past the right edge are what says "there is
              more". */}
          <div className="mt-10 overflow-x-auto pb-4">
            <div className="flex w-max gap-6 px-4 sm:px-6 lg:px-[max(1.5rem,calc((100vw-72rem)/2))]">
              {portfolio.map((item, index) => (
                <BeforeAfterCard key={item.trade} {...item} hint={index === 0} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Escrow: the five states and the receipt ──────────────────────── */}
      <section id="pricing" className="px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto flex max-w-6xl flex-col gap-12">
          <Reveal className="flex max-w-2xl flex-col gap-4">
            <h2 className="text-balance font-heading text-3xl font-semibold tracking-[-0.01em] text-foreground sm:text-4xl">
              {t('pricing.heading')}
            </h2>
            <p className="text-muted-foreground">{t('pricing.body')}</p>
          </Reveal>

          <EscrowFlow />
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section
        id="testimonials"
        className="border-y border-border bg-muted/50 px-4 py-20 sm:px-6 lg:py-28"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-10">
          <Reveal className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-16">
            <h2 className="text-balance font-heading text-3xl font-semibold tracking-[-0.01em] text-foreground sm:text-4xl">
              {t('testimonials.heading')}
            </h2>
            <p className="max-w-lg text-muted-foreground">{t('testimonials.body')}</p>
          </Reveal>

          {featured && (
            <Reveal>
              <figure className="flex flex-col gap-6 rounded-card border border-border bg-surface p-6 shadow-md sm:p-10">
                <StarRating
                  stars={featured.stars}
                  label={t('testimonials.ratingLabel', { rating: featured.stars.rounded })}
                />
                <blockquote className="max-w-4xl text-balance font-heading text-xl font-medium leading-snug tracking-[-0.01em] text-surface-foreground sm:text-3xl">
                  {localised(featured, 'content', locale)}
                </blockquote>
                <figcaption className="flex flex-col text-sm">
                  <span className="font-medium text-surface-foreground">{featured.author}</span>
                  <span className="text-muted-foreground">
                    {localised(featured, 'role', locale)}
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          )}
        </div>

        {/* Full-bleed: undoes the section's side padding. */}
        <div className="-mx-4 mt-10 sm:-mx-6">
          <TestimonialMarquee testimonials={marqueeTestimonials} />
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" className="px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <Reveal className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            <h2 className="text-balance font-heading text-3xl font-semibold tracking-[-0.01em] text-foreground sm:text-4xl">
              {t('faq.heading')}
            </h2>
            <p className="max-w-md text-muted-foreground">{t('faq.body')}</p>
          </Reveal>

          <FaqSection faqs={faqs} />
        </div>
      </section>

      {/* ── Areas we serve ───────────────────────────────────────────────── */}
      {/* Real, visible, indexable content (not just metadata) naming every
          region Kavio covers: the on-page signal that carries far more SEO
          weight than a keywords meta tag ever will. */}
      <section
        aria-labelledby="areas-heading"
        className="border-t border-border px-4 py-20 sm:px-6"
      >
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div className="flex flex-col gap-4">
            <h2
              id="areas-heading"
              className="font-heading text-2xl font-semibold tracking-[-0.01em] text-foreground sm:text-3xl"
            >
              {t('areas.heading')}
            </h2>
            <p className="max-w-md text-muted-foreground">{t('areas.body')}</p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
            {regions.map((region) => (
              <div key={region.key} className="flex flex-col gap-1.5">
                <dt className="text-sm font-medium text-foreground">
                  {t(`areas.regions.${region.key}`)}
                </dt>
                <dd>
                  <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                    {region.cities.map((city) => (
                      <li key={city}>{city}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── The single dark CTA ──────────────────────────────────────────── */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-10 rounded-image bg-neutral-900 px-6 py-14 sm:px-12 sm:py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-end dark:border dark:border-neutral-700 dark:bg-neutral-800">
          <Reveal className="flex flex-col gap-4">
            <h2 className="text-balance font-heading text-3xl font-semibold tracking-[-0.01em] text-neutral-50 sm:text-4xl">
              {t('cta.heading')}
            </h2>
            <p className="max-w-xl text-neutral-300">{t('cta.body')}</p>
          </Reveal>

          <div className="flex flex-col items-start gap-4 lg:items-end">
            {/* The one button. Accent, per the 60/30/10 rule — on the darkest
                surface on the page it is the only saturated element, which is
                exactly the emphasis the ratio is for. */}
            <Button asChild variant="accent" size="lg">
              <Link href="/app/explore">
                {t('cta.button')}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <p className="text-sm text-neutral-400">{t('cta.note')}</p>
            <p className="text-sm text-neutral-300">
              {t('cta.workerPrompt')}{' '}
              <Link
                href="/auth/signup"
                className="rounded-button font-medium text-neutral-50 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('cta.workerLink')}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * Cameroon's ten regions, in the order the coverage list shows them: the two
 * launch regions first, then roughly south to north. `name` matches the
 * `region` field on SERVICE_AREAS; `key` is the translation key.
 */
const REGION_ORDER = [
  { name: 'Littoral', key: 'littoral' },
  { name: 'Centre', key: 'centre' },
  { name: 'South', key: 'south' },
  { name: 'Southwest', key: 'southwest' },
  { name: 'West', key: 'west' },
  { name: 'Northwest', key: 'northwest' },
  { name: 'East', key: 'east' },
  { name: 'Adamawa', key: 'adamawa' },
  { name: 'North', key: 'north' },
  { name: 'Far North', key: 'farNorth' },
] as const;
