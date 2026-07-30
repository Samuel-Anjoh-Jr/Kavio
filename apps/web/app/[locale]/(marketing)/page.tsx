import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { ShieldCheck, Wallet, Star, MapPin } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';
import { CountUpStat } from '@/components/marketing/count-up-stat';
import { TrustScoreRing } from '@/components/marketing/trust-score-ring';
import { TrustEngineProgression } from '@/components/marketing/trust-engine-progression';
import { BeforeAfterCard } from '@/components/marketing/before-after-card';
import { TestimonialMarquee } from '@/components/marketing/testimonial-marquee';
import { VoiceWaveform } from '@/components/marketing/voice-waveform';
import { FaqSection } from '@/components/marketing/faq-section';
import { LandingAnalytics } from '@/components/marketing/landing-analytics';
import { StarRating } from '@/components/ui/star-rating';
import { JsonLd } from '@/components/seo/json-ld';
import { localised } from '@/lib/graphql/marketing';
import { buildMetadata, canonicalFor } from '@/lib/seo';
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
 * The page tells the trust story IN ORDER as you scroll: a claim (hero), the
 * evidence that it is not just a claim (social proof), how the score is actually
 * earned (Trust Engine), proof of work (portfolio), how the money is protected
 * (escrow), who says so (testimonials), the objections (FAQ), and one way in
 * (CTA). Section order is the argument, which is why it lives in one constant
 * that the nav also reads from.
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
    keywords: t('keywords'),
  });
}

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Marketing');
  const format = await getFormatter();
  const { faqs, testimonials, portfolio: portfolioRows } = await loadMarketingContent();

  const featured = testimonials[0];

  // The survey-validated proof points (SRS §20.6). Rendered server-side at their
  // final values; CountUpStat animates toward them once they scroll into view,
  // so the real numbers are in the HTML for crawlers and for no-JS visitors.
  const stats = [
    { key: 'verified', value: 15_000, format: 'integer' as const, suffix: '+', icon: ShieldCheck },
    { key: 'success', value: 98, format: 'integer' as const, suffix: '%', icon: Star },
    { key: 'rating', value: 4.9, format: 'decimal1' as const, suffix: '', icon: Star },
    { key: 'paid', value: 120_000_000, format: 'currency' as const, suffix: '', icon: Wallet },
  ];

  const stages = [15, 35, 60, 82, 100].map((score) => ({
    score,
    label: t(`trustEngine.stages.${score}.label`),
    description: t(`trustEngine.stages.${score}.description`),
  }));

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

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section id="hero" className="relative overflow-hidden px-4 pb-20 pt-12 sm:px-6 sm:pt-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <Reveal className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent">
                <MapPin className="size-4" aria-hidden="true" />
                {t('hero.badge')}
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                {t('footer.tagline')}
              </span>
            </div>

            <h1 className="text-balance font-heading text-4xl font-semibold leading-tight text-foreground sm:text-5xl lg:text-6xl">
              {t('hero.heading')}
            </h1>

            <p className="max-w-lg text-balance text-lg text-muted-foreground">
              {t('hero.subheading')}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="accent" size="lg">
                <Link href="/app/explore">{t('hero.primaryCta')}</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/auth/signup">{t('hero.secondaryCta')}</Link>
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">{t('hero.noAccountNote')}</p>
          </Reveal>

          {/* The portraits + floating trust badge + animated Trust Score. */}
          <div className="relative mx-auto flex w-full max-w-md items-center justify-center">
            <div className="grid w-full grid-cols-2 gap-4">
              <div className="flex flex-col gap-4">
                <PortraitTile
                  src="/marketing/portraits/worker.svg"
                  alt={t('hero.workerPortraitAlt')}
                  className="aspect-3/4"
                  priority
                />
                <PortraitTile
                  src="/marketing/portraits/client.svg"
                  alt={t('hero.clientPortraitAlt')}
                  className="aspect-square"
                />
              </div>
              <div className="flex flex-col justify-center gap-4 pt-8">
                <div className="flex flex-col items-center gap-3 rounded-card bg-surface p-6 shadow-lg">
                  <TrustScoreRing
                    score={82}
                    label={t('hero.trustScoreLabel', { score: 82 })}
                    size={124}
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    {t('hero.trustScoreCaption')}
                  </p>
                </div>
                <PortraitTile
                  src="/marketing/portraits/worker-2.svg"
                  alt={t('hero.workerTwoPortraitAlt')}
                  className="aspect-square"
                />
              </div>
            </div>

            <span className="pointer-events-none absolute -left-2 top-1/3 flex items-center gap-2 rounded-full bg-success px-3 py-2 text-sm font-medium text-success-foreground shadow-lg">
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t('hero.verifiedBadge')}
            </span>
          </div>
        </div>
      </section>

      {/* ── Social proof ─────────────────────────────────────────────────── */}
      <section
        aria-labelledby="proof-heading"
        className="border-y border-border bg-muted/40 px-4 py-14 sm:px-6"
      >
        <div className="mx-auto max-w-6xl">
          <h2 id="proof-heading" className="sr-only">
            {t('proof.heading')}
          </h2>
          <dl className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.key} className="flex flex-col items-center gap-1 text-center">
                <dt className="order-2 text-sm text-muted-foreground">{t(`proof.${stat.key}`)}</dt>
                <dd className="order-1 font-numeric text-3xl font-semibold text-foreground sm:text-4xl">
                  <CountUpStat to={stat.value} format={stat.format}>
                    {stat.format === 'currency'
                      ? format.number(stat.value, 'currency')
                      : format.number(stat.value, { maximumFractionDigits: 1 })}
                  </CountUpStat>
                  {stat.suffix}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Trust Engine ─────────────────────────────────────────────────── */}
      <section id="trust-engine" className="px-4 py-24 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            <h2 className="text-balance font-heading text-3xl font-semibold text-foreground sm:text-4xl">
              {t('trustEngine.heading')}
            </h2>
            <p className="text-balance text-muted-foreground">{t('trustEngine.body')}</p>
            <Button
              asChild
              variant="ghost"
              className="w-fit px-0 text-primary hover:bg-transparent hover:underline"
            >
              <Link href="/app/trust">{t('trustEngine.link')}</Link>
            </Button>
          </Reveal>

          <TrustEngineProgression stages={stages} />
        </div>
      </section>

      {/* ── Portfolio ────────────────────────────────────────────────────── */}
      {/* Admin-managed (PortfolioShowcase); hidden entirely rather than shown
          empty when nobody has published an entry yet. */}
      {portfolio.length > 0 && (
        <section id="portfolio" className="bg-muted/40 py-24">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6">
            <Reveal className="flex flex-col gap-3">
              <h2 className="font-heading text-3xl font-semibold text-foreground sm:text-4xl">
                {t('portfolio.heading')}
              </h2>
              <p className="max-w-2xl text-muted-foreground">{t('portfolio.body')}</p>
            </Reveal>
          </div>

          {/* Full-bleed rail: the horizontal scroll reads as "there is more" only
              if the cards run past the container edge. */}
          <div className="mt-8 overflow-x-auto pb-4">
            <div className="mx-auto flex w-max max-w-none gap-6 px-4 sm:px-6">
              {portfolio.map((item) => (
                <BeforeAfterCard key={item.trade} {...item} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Escrow pricing ───────────────────────────────────────────────── */}
      <section id="pricing" className="px-4 py-24 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-10">
          <Reveal className="flex flex-col gap-3 text-center">
            <h2 className="font-heading text-3xl font-semibold text-foreground sm:text-4xl">
              {t('pricing.heading')}
            </h2>
            <p className="mx-auto max-w-2xl text-balance text-muted-foreground">
              {t('pricing.body')}
            </p>
          </Reveal>

          <ol className="grid gap-4 sm:grid-cols-3">
            {['hold', 'work', 'release'].map((step, index) => (
              <li key={step} className="flex flex-col gap-3 rounded-card bg-surface p-6 shadow-sm">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 font-numeric text-sm font-semibold text-primary">
                  {index + 1}
                </span>
                <h3 className="font-heading font-semibold text-surface-foreground">
                  {t(`pricing.steps.${step}.title`)}
                </h3>
                <p className="text-sm text-muted-foreground">{t(`pricing.steps.${step}.body`)}</p>
              </li>
            ))}
          </ol>

          <div className="flex flex-col items-center gap-2 rounded-card border border-border p-6 text-center">
            <p className="font-heading text-lg font-semibold text-foreground">
              {t('pricing.feeHeading')}
            </p>
            <p className="max-w-xl text-sm text-muted-foreground">{t('pricing.feeBody')}</p>
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section id="testimonials" className="bg-muted/40 py-24">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6">
          <Reveal className="flex flex-col gap-3">
            <h2 className="font-heading text-3xl font-semibold text-foreground sm:text-4xl">
              {t('testimonials.heading')}
            </h2>
            <p className="max-w-2xl text-muted-foreground">{t('testimonials.body')}</p>
          </Reveal>

          {featured && (
            <figure className="flex flex-col gap-5 rounded-card bg-surface p-8 shadow-md sm:flex-row sm:items-center">
              <div className="flex flex-col items-center gap-3 sm:w-40 sm:shrink-0">
                <VoiceWaveform />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('testimonials.voiceNote')}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                <StarRating
                  stars={featured.stars}
                  label={t('testimonials.ratingLabel', { rating: featured.stars.rounded })}
                />
                <blockquote className="text-balance text-lg leading-relaxed text-surface-foreground">
                  {localised(featured, 'content', locale)}
                </blockquote>
                <figcaption className="text-sm text-muted-foreground">
                  {featured.author} · {localised(featured, 'role', locale)}
                </figcaption>
              </div>
            </figure>
          )}
        </div>

        <div className="mt-10">
          <TestimonialMarquee testimonials={testimonials} />
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" className="px-4 py-24 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <Reveal className="flex flex-col gap-3 text-center">
            <h2 className="font-heading text-3xl font-semibold text-foreground sm:text-4xl">
              {t('faq.heading')}
            </h2>
            <p className="text-muted-foreground">{t('faq.body')}</p>
          </Reveal>

          <FaqSection faqs={faqs} />
        </div>
      </section>

      {/* ── The single dark CTA ──────────────────────────────────────────── */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 rounded-image bg-neutral-900 px-6 py-16 text-center">
          <h2 className="text-balance font-heading text-3xl font-semibold text-neutral-50 sm:text-4xl">
            {t('cta.heading')}
          </h2>
          <p className="max-w-xl text-balance text-neutral-300">{t('cta.body')}</p>

          {/* The one button. Accent, per the 60/30/10 rule — on the darkest
              surface on the page it is the only saturated element, which is
              exactly the emphasis the ratio is for. */}
          <Button asChild variant="accent" size="lg">
            <Link href="/app/explore">{t('cta.button')}</Link>
          </Button>

          <p className="text-sm text-neutral-400">{t('cta.note')}</p>
        </div>
      </section>
    </>
  );
}

/**
 * A hero portrait. Plain `<img>` with explicit dimensions: these are local SVGs,
 * and reserving their box in the layout is what keeps the hero out of the CLS
 * budget (NFR-PERF-01). The `priority` one is the LCP candidate and is NOT
 * lazy-loaded — lazy-loading the largest above-the-fold image is the single most
 * common way to miss an LCP target.
 */
function PortraitTile({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    // Local SVG placeholder. next/image gives nothing here — an SVG is already
    // its own optimal form — while the explicit dimensions reserve the box that
    // keeps the hero out of the CLS budget.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={320}
      height={400}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={`w-full rounded-image bg-muted object-cover ${className ?? ''}`}
    />
  );
}
