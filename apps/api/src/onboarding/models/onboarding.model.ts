import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { OnboardingRole } from '@kavio/database';
import { GraphQLJSON } from '../../graphql/json.scalar';

@ObjectType({ description: 'A benefit that unlocks at a profile-completion threshold (TRU-05).' })
export class OnboardingUnlock {
  @Field({ description: 'Message-catalogue key for the EN/FR benefit copy.' })
  key!: string;

  @Field(() => Int, { description: 'Completion percentage at which this unlocks.' })
  threshold!: number;

  @Field()
  unlocked!: boolean;
}

/**
 * Onboarding progress (ACC-10). Read via GraphQL per the DUAL API RULE; every
 * write is a REST call on OnboardingController.
 */
@ObjectType({ description: "An identity's onboarding progress for one role." })
export class Onboarding {
  @Field(() => OnboardingRole)
  role!: OnboardingRole;

  @Field({ description: 'Step to resume on — the first one not yet satisfied.' })
  currentStep!: string;

  @Field(() => Int, {
    description: 'Server-derived completion percentage. Never accepted from a client.',
  })
  completionPercent!: number;

  @Field(() => GraphQLISODateTime, { nullable: true })
  completedAt!: Date | null;

  @Field(() => [String])
  completedSteps!: string[];

  /**
   * The saved answers. JSON because the step shapes are still moving and a
   * typed object per step would be schema churn with no safety gain while the
   * data is not yet authoritative — completion materialises it into typed models.
   */
  @Field(() => GraphQLJSON)
  data!: Record<string, unknown>;

  @Field(() => String, {
    nullable: true,
    description:
      "A starting point for the CLIENT profile step's name field, taken from the account's sign-up name. Only present while that step has no saved answer yet.",
  })
  suggestedDisplayName!: string | null;

  @Field(() => [OnboardingUnlock])
  unlocks!: OnboardingUnlock[];
}
