import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { FeaturedListingStatus, Role, VerificationTier } from '@kavio/database';

/**
 * Sponsored ranking placement reads (business plan: "Featured/Verified
 * Business tier"), served over GraphQL per the DUAL API RULE. Requesting,
 * approving, rejecting, pausing, resuming and revoking are all REST writes.
 */

@ObjectType({ description: 'A sponsored ranking placement, at any point in its lifecycle.' })
export class FeaturedListingView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  userId!: string;

  @Field(() => FeaturedListingStatus)
  status!: FeaturedListingStatus;

  @Field(() => Int, {
    nullable: true,
    description:
      'Extra platform-fee basis points charged on top of the standard escrow fee while APPROVED. Null until a reviewer decides.',
  })
  extraCommissionBps!: number | null;

  @Field(() => Date)
  requestedAt!: Date;

  @Field(() => Date, { nullable: true })
  reviewedAt!: Date | null;

  @Field(() => ID, { nullable: true })
  reviewedById!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Why a request was declined — shown to the subject.',
  })
  rejectionReason!: string | null;

  @Field(() => Date, { nullable: true })
  pausedAt!: Date | null;

  @Field(() => Date, { nullable: true })
  revokedAt!: Date | null;
}

@ObjectType({ description: 'A featured-placement request waiting in the admin review queue.' })
export class FeaturedQueueItemView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  userId!: string;

  @Field(() => String, { nullable: true, description: 'The requester’s display name.' })
  name!: string | null;

  @Field(() => String, { nullable: true })
  avatar!: string | null;

  @Field(() => Role, { nullable: true, description: 'The requester’s active role.' })
  activeRole!: Role | null;

  @Field(() => VerificationTier)
  tier!: VerificationTier;

  @Field(() => Int)
  trustScore!: number;

  @Field(() => Int)
  completedJobs!: number;

  @Field(() => Date)
  requestedAt!: Date;
}
