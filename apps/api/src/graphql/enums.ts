import { registerEnumType } from '@nestjs/graphql';
import { Role, UserStatus, VerificationTier } from '@trustpro/database';

/**
 * Prisma enums exposed to the GraphQL schema. Registering them ONCE here (rather
 * than beside each type that uses them) keeps a single definition per enum —
 * registering the same name twice is a schema-build error, and the descriptions
 * below end up in the generated SDL that clients read.
 */
export function registerGraphQLEnums(): void {
  registerEnumType(Role, {
    name: 'Role',
    description: 'A role an identity can hold. One identity may hold several.',
  });

  registerEnumType(UserStatus, {
    name: 'UserStatus',
    description: 'Account lifecycle state.',
  });

  registerEnumType(VerificationTier, {
    name: 'VerificationTier',
    description:
      'Progressive verification tier (SRS §21.4). Attached to the identity, not the role, so switching role never re-verifies.',
  });
}
