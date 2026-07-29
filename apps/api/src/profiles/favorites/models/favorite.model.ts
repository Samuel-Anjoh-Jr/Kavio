import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { VerificationTier } from '@trustpro/database';

/**
 * A saved worker, as shown on the "Saved" list and used to answer "have I
 * saved this one" on any worker card. Deliberately card-shaped rather than a
 * bare id list — the caller needs enough to render without a second round
 * trip, the same reasoning as the discovery worker card.
 */
@ObjectType({ description: 'A worker the signed-in identity has saved.' })
export class SavedWorkerView {
  @Field(() => ID, {
    description: 'The worker identity — what the profile URL and save toggle use.',
  })
  userId!: string;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => String, { nullable: true })
  avatar!: string | null;

  @Field(() => String, { nullable: true })
  headline!: string | null;

  @Field(() => String, { nullable: true })
  city!: string | null;

  @Field(() => VerificationTier)
  tier!: VerificationTier;

  @Field(() => Int)
  trustScore!: number;

  @Field(() => Int)
  completedJobs!: number;

  @Field(() => Float, { nullable: true, description: 'Null until rated — never zero.' })
  averageRating!: number | null;

  @Field(() => Date)
  savedAt!: Date;
}
