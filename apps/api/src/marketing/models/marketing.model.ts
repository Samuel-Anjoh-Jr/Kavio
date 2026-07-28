import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * Marketing content, read over GraphQL (SRS §26.2; PROMPT 92.1).
 *
 * Entirely PUBLIC — this is the conversion surface an unauthenticated visitor
 * lands on, and gating it behind a session would be gating the front door.
 *
 * Copy comes back in BOTH languages rather than resolved against a locale
 * argument, following ServiceCategoryView and for the same load-bearing reason:
 * this is ADMIN-AUTHORED data (unlike UI strings, which live in next-intl), and
 * a locale-resolved payload would give Apollo's normalized cache a
 * language-specific copy of every entity — so a language switch would either
 * serve the previous language's text or force a full refetch of the page.
 */

@ObjectType({ description: 'One question/answer pair on the marketing FAQ (SRS §26.2).' })
export class FaqView {
  @Field(() => ID)
  id!: string;

  @Field()
  questionEn!: string;

  @Field()
  questionFr!: string;

  @Field({ description: 'Markdown. Rendered client-side; never stored as HTML.' })
  answerEn!: string;

  @Field({ description: 'Markdown. Rendered client-side; never stored as HTML.' })
  answerFr!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Optional free-text grouping such as "payments".',
  })
  category!: string | null;

  @Field(() => Int, { description: 'Admin-chosen display order, ascending.' })
  order!: number;

  @Field({
    description:
      'False hides it from the public FAQ. Unpublished entries are only ever returned to an admin.',
  })
  isPublished!: boolean;
}

/**
 * The star row for a rating, computed on the SERVER (SRS §26.2).
 *
 * Shipped as a breakdown rather than a bare decimal so every surface that draws
 * stars draws the same ones — see star-rating.util.ts for why that is worth a
 * few extra bytes on the wire.
 */
@ObjectType({ description: 'A decimal rating resolved into drawable stars (SRS §26.2).' })
export class StarBreakdownView {
  @Field(() => Int, { description: 'Whole stars to fill.' })
  full!: number;

  @Field(() => Int, { description: 'At most one, by construction.' })
  half!: number;

  @Field(() => Int, { description: 'Outlines completing the row of five.' })
  empty!: number;

  @Field(() => Float, {
    description:
      'The rating rounded to the half actually drawn — what the aria-label should state.',
  })
  rounded!: number;
}

@ObjectType({ description: 'A published customer testimonial (SRS §26.2).' })
export class TestimonialView {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'Stored verbatim, not joined to a live profile.' })
  author!: string;

  @Field()
  roleEn!: string;

  @Field()
  roleFr!: string;

  @Field(() => String, { nullable: true, description: 'Null renders initials instead.' })
  avatarUrl!: string | null;

  @Field()
  contentEn!: string;

  @Field()
  contentFr!: string;

  @Field(() => Float, { description: 'The exact stored rating, 0.0–5.0.' })
  rating!: number;

  @Field(() => StarBreakdownView, {
    description: 'The server-computed star row. Clients render this, never their own rounding.',
  })
  stars!: StarBreakdownView;

  @Field(() => Int)
  order!: number;

  @Field({ description: 'False hides it from the marquee.' })
  visible!: boolean;
}

@ObjectType({
  description: 'A before/after entry in the landing page Portfolio showcase (SRS §26.2).',
})
export class PortfolioShowcaseView {
  @Field(() => ID)
  id!: string;

  @Field()
  tradeEn!: string;

  @Field()
  tradeFr!: string;

  @Field()
  captionEn!: string;

  @Field()
  captionFr!: string;

  @Field()
  beforeUrl!: string;

  @Field()
  afterUrl!: string;

  @Field(() => Int, { description: 'Admin-chosen display order, ascending.' })
  order!: number;

  @Field({
    description:
      'False hides it from the public showcase. Unpublished entries are only ever returned to an admin.',
  })
  isPublished!: boolean;
}
