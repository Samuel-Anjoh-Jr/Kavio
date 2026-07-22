import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  TeamMemberAccessLevel,
  TeamMemberRole,
  TeamMemberStatus,
  TransactionType,
  VerificationTier,
} from '@trustpro/database';

/**
 * Business reads (BIZ-01, BIZ-02, BIZ-03), served over GraphQL per the DUAL API
 * RULE. Inviting, re-scoping, removing and submitting RCCM papers are REST writes.
 *
 * Nothing here is public. A company's spend, its team roster and its hire rate
 * are its own business — the public face of a business is its profile, which
 * lives in ProfilesModule and is browsable by guests.
 */

@ObjectType({ description: 'A member of a business team (BIZ-03).' })
export class TeamMemberView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID, {
    nullable: true,
    description:
      'The bound identity. NULL while the invitation is still outstanding — and an unbound seat grants no access at all.',
  })
  userId!: string | null;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  email!: string | null;

  @Field(() => String, { nullable: true })
  phone!: string | null;

  @Field(() => String, { nullable: true, description: 'Their job title inside the company.' })
  title!: string | null;

  @Field(() => TeamMemberRole, { description: 'The HR label. Not a permission.' })
  role!: TeamMemberRole;

  @Field(() => TeamMemberAccessLevel, {
    description: 'What the server actually enforces for this member.',
  })
  accessLevel!: TeamMemberAccessLevel;

  @Field(() => TeamMemberStatus)
  status!: TeamMemberStatus;

  @Field(() => Date, { nullable: true })
  invitationSentAt!: Date | null;

  @Field(() => Date, { nullable: true })
  invitationExpiresAt!: Date | null;

  @Field(() => Date, { nullable: true })
  acceptedAt!: Date | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({
  description:
    'The company wallet (BIZ-03): a scoped view over the shared ledger, not a second balance. Every figure reconciles with the transaction history because it IS the transaction history, filtered to this company’s jobs.',
})
export class CompanyWalletView {
  @Field(() => ID)
  businessProfileId!: string;

  @Field(() => Int, { description: 'Whole XAF committed to live escrows.' })
  inEscrow!: number;

  @Field(() => Int, { description: 'Whole XAF settled to workers on released escrows.' })
  totalSpent!: number;

  @Field(() => Int, { description: 'Platform fees included in the settled total.' })
  platformFees!: number;

  @Field(() => Int, { description: 'Whole XAF returned on refunded escrows.' })
  totalRefunded!: number;
}

@ObjectType({ description: 'The business dashboard summary (BIZ-02).' })
export class BusinessDashboardView {
  @Field(() => ID)
  businessProfileId!: string;

  @Field(() => String)
  name!: string;

  @Field({ description: 'RCCM registration approved — the Verified Business badge (BIZ-01).' })
  verified!: boolean;

  @Field(() => Int, { description: 'Posts open, quoted or accepted.' })
  activePosts!: number;

  @Field(() => Int, { description: 'Unpublished drafts.' })
  draftPosts!: number;

  @Field(() => Int, { description: 'Applications still waiting on a decision.' })
  pendingApplications!: number;

  @Field(() => Int)
  inProgressJobs!: number;

  @Field(() => Int)
  completedJobs!: number;

  @Field(() => CompanyWalletView)
  wallet!: CompanyWalletView;
}

@ObjectType({ description: 'Business analytics (BIZ-03).' })
export class BusinessAnalyticsView {
  @Field(() => ID)
  businessProfileId!: string;

  @Field(() => Int, { description: 'Published posts. Drafts are excluded.' })
  jobsPosted!: number;

  @Field(() => Int, { description: 'Posts that produced a booking.' })
  jobsHired!: number;

  @Field(() => Float, {
    nullable: true,
    description:
      'Hired ÷ posted, 0–1. NULL before anything has been posted — "we hire 0% of the time" and "we have not posted yet" are different facts.',
  })
  hireRate!: number | null;

  @Field(() => Int)
  completedJobs!: number;

  @Field(() => Int, { description: 'Whole XAF settled across released escrows.' })
  totalSpent!: number;

  @Field(() => Int, { nullable: true, description: 'Mean settled booking value in whole XAF.' })
  averageJobValue!: number | null;

  @Field(() => Float, {
    nullable: true,
    description:
      'Mean rating the workers this company hired received on its jobs — the quality of the work it commissioned, not the company’s own rating.',
  })
  averageRating!: number | null;

  @Field(() => Int, { description: 'Reviews behind that average.' })
  ratedJobs!: number;
}

@ObjectType({ description: 'One payment against a company job (BIZ-02).' })
export class CompanyPaymentView {
  @Field(() => ID)
  id!: string;

  @Field(() => TransactionType)
  type!: TransactionType;

  @Field(() => Int, { description: 'Whole XAF.' })
  amount!: number;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String, { nullable: true })
  jobTitle!: string | null;

  @Field(() => ID, { nullable: true })
  bookingId!: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date, { nullable: true })
  settledAt!: Date | null;
}

@ObjectType({
  description:
    'Whether the company may take Tier-3-gated corporate engagements (BIZ-01). Requires BOTH approved registration and a Tier 3 owner — a certificate proves a company was filed, which is cheap; the tier proves a person behind it has been field-verified and has delivered.',
})
export class CorporateEligibilityView {
  @Field(() => ID)
  businessProfileId!: string;

  @Field()
  eligible!: boolean;

  @Field({ description: 'RCCM registration approved by staff.' })
  verifiedBusiness!: boolean;

  @Field(() => Date, { nullable: true })
  verifiedAt!: Date | null;

  @Field(() => VerificationTier, { description: 'The owner identity’s current tier.' })
  ownerTier!: VerificationTier;

  @Field(() => [String], {
    description:
      'Coded reasons still unmet: BUSINESS_REGISTRATION_NOT_APPROVED, OWNER_NOT_TIER_3. Codes, not sentences — the EN/FR copy lives in the web catalogue.',
  })
  unmet!: string[];
}

@ObjectType({
  description:
    'What the calling identity may do for this business (BIZ-03), so the UI renders the surface their access level actually allows.',
})
export class BusinessAccessView {
  @Field(() => ID)
  businessProfileId!: string;

  @Field()
  isOwner!: boolean;

  @Field(() => TeamMemberAccessLevel, {
    nullable: true,
    description: 'NULL for the owner, who is not scoped by an access level.',
  })
  accessLevel!: TeamMemberAccessLevel | null;

  @Field(() => [String], {
    description:
      'Capability codes: business:view, business:jobs, business:payments, business:team, business:profile.',
  })
  capabilities!: string[];
}
