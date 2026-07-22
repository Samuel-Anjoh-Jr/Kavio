import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * Review reads (REV-01, REV-02), served over GraphQL per the DUAL API RULE.
 * Submitting, reporting and moderating are all REST writes.
 *
 * These types are readable by guests: the first-interface lets an
 * unauthenticated visitor open a full worker profile (ACC-01), and reviews are
 * the evidence that profile exists to show. Nothing here exposes a hidden
 * review, a moderation reason, or who reported what — that is staff material.
 */

@ObjectType({ description: 'One bar of the rating distribution (REV-02).' })
export class RatingDistributionView {
  @Field(() => Int, { description: 'Star value, 1–5.' })
  rating!: number;

  @Field(() => Int)
  count!: number;

  @Field(() => Float, { description: 'Share of the total, 0–1. Zero when unrated.' })
  share!: number;
}

@ObjectType({ description: 'The reviews summary shown on a profile (REV-02).' })
export class ReviewSummaryView {
  @Field(() => ID)
  subjectId!: string;

  @Field(() => Int, { description: 'Visible reviews. Hidden ones are excluded.' })
  total!: number;

  @Field(() => Float, {
    nullable: true,
    description:
      'Mean of visible ratings to two decimals. NULL when unrated — "no reviews yet" and "rated zero" are different facts, and the Tier 3 rating gate must not be satisfied by an absence of evidence.',
  })
  average!: number | null;

  @Field(() => [RatingDistributionView], {
    description: 'All five bars, including empty ones — a chart that drops them misreports itself.',
  })
  distribution!: RatingDistributionView[];
}

@ObjectType({ description: 'One review on a profile (REV-01, REV-02).' })
export class ReviewListItemView {
  @Field(() => ID)
  id!: string;

  @Field(() => Int, { description: '1–5 stars.' })
  rating!: number;

  @Field(() => String, { nullable: true })
  text!: string | null;

  @Field(() => ID)
  authorId!: string;

  @Field(() => String, { nullable: true, description: 'The reviewer’s display name.' })
  authorName!: string | null;

  @Field(() => ID, { description: 'The completed job this review is tied to (REV-02).' })
  jobId!: string;

  @Field(() => String, { description: 'The job’s title, for context on the card.' })
  jobTitle!: string;

  @Field(() => [String], { description: 'Photos attached to the review (REV-01).' })
  photoUrls!: string[];

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({
  description:
    'Whether the caller may review a job, and about whom (REV-01). Drives the review CTA — a client who cannot review is told why rather than shown a button that fails.',
})
export class ReviewEligibilityView {
  @Field(() => ID)
  jobId!: string;

  @Field()
  allowed!: boolean;

  @Field(() => String, {
    description:
      'Coded outcome: ELIGIBLE, NO_BOOKING, NOT_A_PARTICIPANT, NOT_COMPLETED or ALREADY_REVIEWED. A code, not a sentence — the EN/FR copy lives in the web catalogue.',
  })
  reason!: string;

  @Field(() => ID, {
    nullable: true,
    description: 'Who the review would be about. Derived from the booking, never supplied.',
  })
  subjectId!: string | null;
}
