import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { TeamMemberRole, VerificationTier } from '@trustpro/database';

/**
 * The public business profile (PROMPT 47; PRO-06).
 *
 * Tabs: About, Jobs, Reviews, Team, Documents — all five resolved in one query.
 *
 * ── What the Documents tab shows, and what it does not ─────────────────────
 * It shows WHICH registrations have been VERIFIED, never the documents. A
 * business's RCCM scan carries the owner's full legal name, signature and
 * address; it is uploaded so staff can check it, not so the public can read it.
 * Serving it here would be a KYC leak wearing a "transparency" label, and every
 * such file is PRIVATE in the storage policy for exactly this reason (NFR-SEC-04).
 *
 * The trust signal a client actually needs is "somebody checked this and it was
 * real", which is what a verified badge says without publishing anything.
 */

@ObjectType({ description: 'A team member shown on the company profile (BIZ-03, PRO-06).' })
export class BusinessTeamMemberView {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => TeamMemberRole)
  role!: TeamMemberRole;

  @Field(() => Date)
  joinedAt!: Date;
}

@ObjectType({
  description:
    'A registration the business has had verified (PRO-06). The document itself is never exposed — only the fact that staff checked it.',
})
export class BusinessCredentialView {
  @Field({ description: 'i18n key for the credential label, e.g. "credential.rccm".' })
  labelKey!: string;

  @Field({ description: 'True once staff approved the underlying check.' })
  verified!: boolean;

  @Field(() => Date, { nullable: true })
  verifiedAt!: Date | null;
}

@ObjectType({ description: 'Aggregate company stats (PRO-06).' })
export class BusinessStatsView {
  @Field(() => Int, { description: 'Active team members.' })
  teamSize!: number;

  @Field(() => Int, { description: 'Trust Score of the owning identity (0-100).' })
  trustScore!: number;

  @Field(() => Int)
  completedJobs!: number;

  @Field(() => Float, { nullable: true, description: 'Null until rated — never zero.' })
  averageRating!: number | null;

  @Field(() => Int, {
    description:
      'Jobs currently posted. Zero until the jobs module lands (Phase 4) — see jobsAvailable before rendering the tab as empty.',
  })
  openJobCount!: number;

  @Field({
    description:
      'False while no jobs module exists to count. Distinguishes "this company has posted nothing" from "we cannot tell yet", which look identical as a zero.',
  })
  jobsAvailable!: boolean;
}

@ObjectType({ description: 'The public company profile (PRO-06).' })
export class BusinessProfileView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID, { description: 'The owning identity — trust and tier attach here.' })
  ownerId!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String, { nullable: true, description: 'Logo URL. Logos are public media.' })
  logoUrl!: string | null;

  @Field(() => String, {
    nullable: true,
    description:
      'Public contact email the business chose to publish — never the owner’s account email.',
  })
  contactEmail!: string | null;

  @Field(() => String, { nullable: true })
  contactPhone!: string | null;

  @Field(() => String, { nullable: true })
  city!: string | null;

  @Field(() => String, { nullable: true })
  area!: string | null;

  @Field(() => String, { nullable: true })
  address!: string | null;

  @Field(() => String, {
    nullable: true,
    description:
      'RCCM registration number. Published because it is a PUBLIC register — anybody can look it up, and showing it is what lets a client check us rather than trust us.',
  })
  rccmNumber!: string | null;

  @Field({ description: 'True once staff approved the business registration (BIZ-01).' })
  verified!: boolean;

  @Field(() => VerificationTier, { description: 'Tier of the owning identity.' })
  ownerTier!: VerificationTier;

  @Field(() => Date, { description: 'Member since (PRO-06).' })
  createdAt!: Date;

  @Field(() => BusinessStatsView)
  stats!: BusinessStatsView;

  @Field(() => [BusinessTeamMemberView], { description: 'Team tab — active members only.' })
  team!: BusinessTeamMemberView[];

  @Field(() => [BusinessCredentialView], {
    description: 'Documents tab — verified claims, not files.',
  })
  credentials!: BusinessCredentialView[];
}
