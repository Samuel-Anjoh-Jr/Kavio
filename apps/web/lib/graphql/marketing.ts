import { gql } from '@apollo/client';

/**
 * Marketing-content READS (DUAL API RULE; SRS §26.2). Writes are REST
 * (lib/marketing.ts). Mirrors apps/api/src/marketing/models/marketing.model.ts.
 *
 * Both are PUBLIC queries — this is the landing page, the surface a visitor
 * meets before they have any reason to have an account.
 *
 * Copy arrives in BOTH languages rather than resolved server-side against a
 * locale, matching the taxonomy reads: this is admin-authored data, and a
 * locale-resolved payload would leave Apollo's normalized cache holding one
 * language's copy of each entity, so switching language would serve the other
 * one's text until a full refetch.
 */

export interface StarBreakdown {
  full: number;
  /** At most one, by construction. */
  half: number;
  empty: number;
  /** The rating rounded to the half actually drawn — what the aria-label states. */
  rounded: number;
}

export interface FaqEntry {
  id: string;
  questionEn: string;
  questionFr: string;
  /** Markdown. */
  answerEn: string;
  answerFr: string;
  category: string | null;
  order: number;
  isPublished: boolean;
}

export interface TestimonialEntry {
  id: string;
  author: string;
  roleEn: string;
  roleFr: string;
  avatarUrl: string | null;
  contentEn: string;
  contentFr: string;
  rating: number;
  /** Computed server-side — never re-derived here (SRS §26.2). */
  stars: StarBreakdown;
  order: number;
  visible: boolean;
}

export interface PortfolioItemEntry {
  id: string;
  tradeEn: string;
  tradeFr: string;
  captionEn: string;
  captionFr: string;
  beforeUrl: string;
  afterUrl: string;
  order: number;
  isPublished: boolean;
}

export interface MarketingContentQueryResult {
  faqs: FaqEntry[];
  testimonials: TestimonialEntry[];
  portfolio: PortfolioItemEntry[];
}

/**
 * One round trip for both sections. They render on the same page and neither is
 * useful without the other, so two queries would only buy two chances to fail.
 */
export const MARKETING_CONTENT_QUERY = gql`
  query MarketingContent {
    faqs {
      id
      questionEn
      questionFr
      answerEn
      answerFr
      category
      order
      isPublished
    }
    testimonials {
      id
      author
      roleEn
      roleFr
      avatarUrl
      contentEn
      contentFr
      rating
      stars {
        full
        half
        empty
        rounded
      }
      order
      visible
    }
    portfolio {
      id
      tradeEn
      tradeFr
      captionEn
      captionFr
      beforeUrl
      afterUrl
      order
      isPublished
    }
  }
`;

/**
 * The admin console's view: drafts and hidden entries included. Same resolvers,
 * same filters — the flags are honoured server-side against the caller's active
 * role, so this cannot be used to peek at drafts without the permission.
 */
export const ADMIN_MARKETING_CONTENT_QUERY = gql`
  query AdminMarketingContent {
    faqs(includeUnpublished: true) {
      id
      questionEn
      questionFr
      answerEn
      answerFr
      category
      order
      isPublished
    }
    testimonials(includeHidden: true) {
      id
      author
      roleEn
      roleFr
      avatarUrl
      contentEn
      contentFr
      rating
      stars {
        full
        half
        empty
        rounded
      }
      order
      visible
    }
    portfolio(includeUnpublished: true) {
      id
      tradeEn
      tradeFr
      captionEn
      captionFr
      beforeUrl
      afterUrl
      order
      isPublished
    }
  }
`;

/**
 * Picks the viewer's language out of a bilingual row (`fooEn` / `fooFr`).
 *
 * Accepts the concrete entry types rather than a generic `Record`, so call sites
 * pass a `FaqEntry`, `TestimonialEntry` or `PortfolioItemEntry` directly; the
 * string-index read is cast internally, which is the one place that lookup is
 * untyped by necessity.
 */
export function localised(
  row: FaqEntry | TestimonialEntry | PortfolioItemEntry,
  field: string,
  locale: string,
): string {
  const key = `${field}${locale === 'fr' ? 'Fr' : 'En'}`;
  return ((row as unknown as Record<string, unknown>)[key] as string | undefined) ?? '';
}
