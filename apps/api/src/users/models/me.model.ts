import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Role, UserStatus, VerificationTier } from '@kavio/database';

/** One role grant on the identity (ACC-06). */
@ObjectType({ description: 'A role granted to an identity.' })
export class RoleGrant {
  @Field(() => Role)
  role!: Role;

  @Field({ description: 'True for the role the current session is acting as.' })
  isActive!: boolean;

  @Field(() => Date)
  grantedAt!: Date;
}

/**
 * The signed-in identity (ACC-06). Read via GraphQL per the DUAL API RULE, so the
 * client asks for exactly the fields a given surface needs and Apollo's normalized
 * cache becomes the single source of truth for identity reads.
 *
 * `tier` and `trustScore` sit on this type — not on RoleGrant — because they
 * belong to the identity. That is the whole guarantee behind the Role Switcher:
 * a Worker who starts hiring keeps every check they have already passed.
 */
@ObjectType({ description: 'The currently authenticated identity.' })
export class Me {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  phone!: string | null;

  @Field(() => String, { nullable: true })
  email!: string | null;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => String, { nullable: true })
  avatar!: string | null;

  @Field({ description: 'UI language, "en" or "fr".' })
  locale!: string;

  @Field(() => UserStatus)
  status!: UserStatus;

  @Field(() => VerificationTier, {
    description: 'Verification tier, held on the identity rather than per role.',
  })
  tier!: VerificationTier;

  @Field(() => Int, { description: 'Trust Score (0–100), held on the identity.' })
  trustScore!: number;

  @Field(() => Role, {
    description: 'The role this session is acting as — mirrors the activeRole JWT claim.',
  })
  activeRole!: Role;

  @Field(() => [RoleGrant], { description: 'Every role this identity holds.' })
  roles!: RoleGrant[];

  @Field(() => [String], {
    description:
      'Permissions the ACTIVE role grants. For hiding actions the user cannot take — the server re-checks every one of them regardless.',
  })
  permissions!: string[];

  @Field()
  twoFactorEnabled!: boolean;

  @Field(() => Date, { nullable: true })
  phoneVerifiedAt!: Date | null;

  @Field(() => Date, { nullable: true })
  emailVerifiedAt!: Date | null;

  @Field(() => Date)
  createdAt!: Date;
}
