import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { AgentInvitationStatus, Role, UserStatus, VerificationTier } from '@kavio/database';
import { RequirePermissions } from '../auth/decorators/auth.decorators';
import { AdminUsersService } from './admin-users.service';
import { AdminUserPageView, AgentInvitationView } from './models/admin-users.model';

/**
 * The admin account directory and agent invitations (ADM-02, ADM-06). GraphQL
 * reads per the DUAL API RULE.
 *
 * Gated on `admin:user_manage` — the capability, not the ADMIN role name, so a
 * future support role can be given the directory without the whole console
 * (NFR-SEC-02).
 *
 * There is no `adminUser(id)` detail query here on purpose. Everything a
 * detail pane needs — trust breakdown, verification history, moderation trail —
 * already has its own permission-gated query in the module that owns it, and
 * duplicating them behind one fat admin query would put four separately-gated
 * datasets behind a single permission.
 */
@Resolver()
export class AdminUsersResolver {
  constructor(private readonly users: AdminUsersService) {}

  @RequirePermissions('admin:user_manage')
  @Query(() => AdminUserPageView, {
    description:
      'Search and filter every account type — users, workers, businesses, agents (ADM-02).',
  })
  async adminUsers(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('role', { type: () => Role, nullable: true }) role?: Role,
    @Args('status', { type: () => UserStatus, nullable: true }) status?: UserStatus,
    @Args('tier', { type: () => VerificationTier, nullable: true }) tier?: VerificationTier,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<AdminUserPageView> {
    return this.users.listUsers({
      query: query?.trim() || undefined,
      role: role ?? undefined,
      status: status ?? undefined,
      tier: tier ?? undefined,
      limit: limit ?? undefined,
      offset: offset ?? undefined,
    });
  }

  @RequirePermissions('admin:user_manage')
  @Query(() => [AgentInvitationView], {
    description: 'Agent invitations, outstanding first (ADM-06). Never returns a raw token.',
  })
  async adminAgentInvitations(
    @Args('status', { type: () => AgentInvitationStatus, nullable: true })
    status?: AgentInvitationStatus,
  ): Promise<AgentInvitationView[]> {
    return this.users.listAgentInvitations(status ?? undefined);
  }
}
