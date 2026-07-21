import { Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { Me } from './models/me.model';
import { UsersService } from './users.service';

/**
 * Identity reads (GraphQL, per the DUAL API RULE). Every mutation on this data —
 * role switch, 2FA toggle, password change — is a REST call on AuthController.
 *
 * No @Public() here, so the globally registered JwtAuthGuard applies: `me` is a
 * privileged read and an anonymous caller is rejected rather than served a null.
 */
@Resolver(() => Me)
export class UsersResolver {
  constructor(private readonly users: UsersService) {}

  @Query(() => Me, {
    description:
      'The signed-in identity: roles, activeRole, tier and Trust Score. Requires a bearer access token.',
  })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<Me> {
    return this.users.findMe(user);
  }
}
