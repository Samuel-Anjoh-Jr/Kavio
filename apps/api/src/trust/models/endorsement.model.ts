import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { BadgeType, EndorsementRelationship } from '@kavio/database';

/**
 * Endorsement, badge and trust-history reads (TRU-10, TRU-11).
 *
 * Endorsements and badges are PUBLIC — they are evidence a worker offers to
 * strangers, and hiding them would defeat the point. The trust HISTORY is not:
 * a dated log of every setback belongs to the person it happened to.
 */

@ObjectType({ description: 'A community endorsement shown on a profile (TRU-10).' })
export class EndorsementView {
  @Field(() => ID)
  id!: string;

  @Field(() => EndorsementRelationship, { description: 'How the endorser knows them.' })
  relationship!: EndorsementRelationship;

  @Field({ description: 'i18n key for the relationship label.' })
  relationshipKey!: string;

  @Field()
  quote!: string;

  @Field(() => Int, { description: '1–5 stars.' })
  rating!: number;

  @Field(() => String, {
    nullable: true,
    description:
      'Display name of the endorser: their account name, or the name a Field Agent recorded for an off-platform endorser.',
  })
  authorName!: string | null;

  @Field(() => ID, { nullable: true, description: 'Set when the endorser has an account.' })
  authorId!: string | null;

  @Field({
    description:
      'False for an endorsement captured in person by an agent. Surfaced so the UI can label it honestly rather than implying a platform account exists.',
  })
  onPlatform!: boolean;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({
  description:
    'How much endorsements are contributing right now, and how the taper is shaping it (TRU-10).',
})
export class EndorsementInfluenceView {
  @Field(() => Int, { description: 'Approved, unrevoked endorsements.' })
  approvedCount!: number;

  @Field(() => Int, { description: 'Points before the taper, already capped.' })
  cappedPoints!: number;

  @Field(() => Float, {
    description:
      'Taper multiplier: 1 with no job history, falling to 0 once `taperedOutAt` jobs are complete.',
  })
  taper!: number;

  @Field(() => Int, { description: 'What endorsements actually contribute today.' })
  effectivePoints!: number;

  @Field(() => Int, { description: 'The hard ceiling endorsements can ever reach.' })
  cap!: number;

  @Field(() => Int)
  completedJobs!: number;

  @Field(() => Int, {
    description: 'Completed jobs at which endorsements stop contributing entirely.',
  })
  taperedOutAt!: number;
}

@ObjectType({ description: 'A milestone badge (TRU-11).' })
export class BadgeView {
  @Field(() => BadgeType)
  type!: BadgeType;

  @Field({ description: 'i18n key for the badge name.' })
  labelKey!: string;

  @Field({ description: 'i18n key for what it means and how it was earned.' })
  descriptionKey!: string;

  @Field(() => Date)
  awardedAt!: Date;
}

@ObjectType({ description: 'One entry in the trust history timeline (TRU-11).' })
export class TrustHistoryEntryView {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'SCORE_EVENT | BADGE | TIER_CHANGE.' })
  kind!: string;

  @Field(() => Date)
  occurredAt!: Date;

  @Field({ description: 'i18n key for the headline. The API never returns a sentence.' })
  labelKey!: string;

  @Field(() => BadgeType, { nullable: true, description: 'Set on BADGE entries.' })
  badge!: BadgeType | null;

  @Field(() => Int, {
    nullable: true,
    description: 'Nominal point impact recorded at the time, on SCORE_EVENT entries.',
  })
  delta!: number | null;

  @Field(() => String, { nullable: true, description: 'The tier reached, on TIER_CHANGE entries.' })
  tier!: string | null;
}
