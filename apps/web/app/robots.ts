import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-config';

/**
 * robots.txt (SYS-05, SRS §26.4).
 *
 * Two deliberate strategies here:
 *
 *   1. PRIVATE SURFACES ARE DISALLOWED FOR EVERY BOT. The app shell is the
 *      authenticated product; account, auth, search-results and filtered/preview
 *      URLs are duplicate, private, or effectively infinite (§26.4). Discovery is
 *      crawled through the marketing site and the individual worker/job detail
 *      pages, which sit OUTSIDE these prefixes.
 *
 *   2. AI ANSWER-ENGINE CRAWLERS ARE EXPLICITLY WELCOMED on the public surface.
 *      This is the modern half of SEO: to be CITED in a ChatGPT, Gemini,
 *      Perplexity or Copilot answer, the engine's crawler has to be allowed to
 *      read the page, and several of them (Google-Extended, Applebot-Extended)
 *      only grant AI use when EXPLICITLY permitted — silence is treated as
 *      opt-out. For a trust marketplace that wants to be the answer to "find a
 *      verified electrician in Douala", being absent from AI answers is being
 *      absent from the market. So every major AI crawler is named and allowed,
 *      with the same private exclusions as everyone else.
 */

const PRIVATE_PATHS = [
  '/*/auth/',
  '/*/app/settings/',
  '/*/app/wallet/',
  '/*/app/messages/',
  '/*/app/notifications/',
  '/*/app/admin/',
  '/*/app/onboarding/',
  '/*/app/verification/',
  '/*/app/disputes/',
  '/*/app/quotes/',
  '/*/app/safety/',
  '/*/app/business/',
  '/*/maintenance',
  // Query-bearing crawls: filtered discovery and search results are duplicate
  // or infinite variants of the clean pages (§26.4).
  '/*?*',
];

/**
 * AI / answer-engine crawlers we explicitly permit on public content. Naming
 * them does two things a bare `*` rule does not: it opts IN the training-gated
 * ones (Google-Extended, Applebot-Extended), and it states intent for the
 * search/citation ones so a policy change is a one-line edit here.
 */
const AI_CRAWLERS = [
  'GPTBot', // OpenAI training
  'OAI-SearchBot', // ChatGPT search
  'ChatGPT-User', // ChatGPT browsing on a user's behalf
  'ClaudeBot', // Anthropic
  'anthropic-ai',
  'Claude-Web',
  'PerplexityBot', // Perplexity index
  'Perplexity-User',
  'Google-Extended', // Gemini / Google AI (training-gated — silence = opt-out)
  'Applebot-Extended', // Apple Intelligence (training-gated)
  'Applebot', // Siri / Spotlight
  'Amazonbot',
  'cohere-ai',
  'CCBot', // Common Crawl — feeds many open models
  'Bytespider',
  'DuckAssistBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Everyone else: browse the public site, stay out of the private surfaces.
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      // The AI crawlers, explicitly welcomed on the same public surface.
      { userAgent: AI_CRAWLERS, allow: '/', disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
