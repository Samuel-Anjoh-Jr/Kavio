import { Field, Int, ObjectType } from '@nestjs/graphql';

/** One concrete thing still standing between this identity and the job board. */
@ObjectType({ description: 'A remaining step before public job listings unlock.' })
export class PostingUnlockStepView {
  @Field(() => String, { description: '"CHECK" or "BUSINESS_PROFILE".' })
  kind!: string;

  @Field(() => String, { nullable: true, description: 'The verification check, when kind=CHECK.' })
  checkType!: string | null;

  @Field(() => String, {
    description: 'Stable i18n key for the instruction line. The web catalogue owns EN/FR.',
  })
  messageKey!: string;
}

/**
 * Whether the signed-in identity may publish a PUBLIC job, and what it costs
 * (JOB-01, ADM-07).
 *
 * Read BEFORE the attempt, not only after a refusal. A gate that only speaks
 * when you have already filled in a four-step form is a trapdoor; the same facts
 * offered up front are an invitation, which is the whole point of the anti-lure
 * design being a guided detour rather than a wall.
 */
@ObjectType({
  description: 'Whether this identity may post a public job vacancy, and at what fee.',
})
export class JobPostingEligibilityView {
  @Field({ description: 'True when a PUBLIC listing would be accepted right now.' })
  allowed!: boolean;

  @Field({ description: 'The identity owns a business whose registration staff approved.' })
  businessVerified!: boolean;

  @Field(() => Int, {
    description: 'Flat charge to publish, in whole XAF. 0 means free, and must be shown as free.',
  })
  feeXaf!: number;

  @Field(() => [PostingUnlockStepView], {
    description: 'Empty when allowed; the exact remaining steps otherwise.',
  })
  steps!: PostingUnlockStepView[];
}
