import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { AgentInvitationStatus, Role, UserStatus, VerificationTier } from '@kavio/database';

/**
 * Account management and agent invitations (ADM-02, ADM-06), served over GraphQL
 * per the DUAL API RULE.
 *
 * ── What an admin list deliberately does NOT carry ──────────────────────────
 *
 * No password hash, no session token, no KYC document URL, no raw invitation
 * token. An admin console is the highest-value phishing target on the platform,
 * and the blast radius of a compromised admin session is bounded by what the
 * console can actually read. Document review has its own permission and its own
 * screen (ADM-03) with signed, expiring URLs; it is not folded into a list view
 * that loads for every search.
 */

@ObjectType({ description: 'One account in the admin directory (ADM-02).' })
export class AdminUserView {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => String, { nullable: true })
  email!: string | null;

  @Field(() => String, { nullable: true })
  phone!: string | null;

  @Field(() => String, { nullable: true })
  avatar!: string | null;

  @Field(() => UserStatus)
  status!: UserStatus;

  @Field(() => VerificationTier, { description: 'Held on the IDENTITY, not the role.' })
  tier!: VerificationTier;

  @Field(() => Int, { description: 'Trust Score, 0–100.' })
  trustScore!: number;

  @Field(() => [Role], {
    description:
      'Every role this identity holds. One identity can be Worker, Client and Business at once (ACC-06).',
  })
  roles!: Role[];

  @Field(() => Role, { nullable: true, description: 'The role they are currently acting as.' })
  activeRole!: Role | null;

  @Field(() => Int, { description: 'Completed jobs, from the trust snapshot.' })
  completedJobs!: number;

  @Field(() => Float, { nullable: true, description: 'NULL until rated — not zero.' })
  averageRating!: number | null;

  @Field(() => Int, { description: 'Moderation actions ever taken against them.' })
  moderationActionCount!: number;

  @Field(() => Int, { description: 'Abuse reports about them still open.' })
  openReportCount!: number;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({ description: 'A page of accounts (ADM-02).' })
export class AdminUserPageView {
  @Field(() => [AdminUserView])
  items!: AdminUserView[];

  @Field(() => Int, { description: 'Total matching the filter, for the pager.' })
  total!: number;

  @Field(() => Boolean)
  hasMore!: boolean;
}

@ObjectType({
  description:
    'An admin invitation for someone to join as a field AGENT (ADM-06). The raw token is never returned — it exists only in the invitation that was sent.',
})
export class AgentInvitationView {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  email!: string;

  @Field(() => String, { nullable: true })
  phone!: string | null;

  @Field(() => AgentInvitationStatus)
  status!: AgentInvitationStatus;

  @Field(() => String, { nullable: true, description: 'The inviting admin’s name.' })
  invitedByName!: string | null;

  @Field(() => ID, {
    nullable: true,
    description: 'The identity created on acceptance. NULL while outstanding.',
  })
  acceptedUserId!: string | null;

  @Field(() => String, { nullable: true })
  note!: string | null;

  @Field(() => Date)
  expiresAt!: Date;

  @Field(() => Date, { nullable: true })
  acceptedAt!: Date | null;

  @Field(() => Date)
  createdAt!: Date;
}
