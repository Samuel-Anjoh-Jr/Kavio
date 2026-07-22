import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { capabilitiesFor } from './business-access.model';
import { BusinessAccessService } from './business-access.service';
import { BusinessAnalyticsService } from './business-analytics.service';
import { BusinessVerificationService } from './business-verification.service';
import { TeamService } from './team.service';
import {
  BusinessAccessView,
  BusinessAnalyticsView,
  BusinessDashboardView,
  CompanyPaymentView,
  CompanyWalletView,
  CorporateEligibilityView,
  TeamMemberView,
} from './models/business.model';

/**
 * Business READS (GraphQL, per the DUAL API RULE; BIZ-01, BIZ-02, BIZ-03).
 *
 * Nothing here is @Public(): a company's spend, roster and hire rate are its own
 * business. The public face of a business is its profile, which lives in
 * ProfilesModule and is guest-browsable.
 *
 * Every query resolves the caller's access level before returning a row — the
 * `@RequirePermissions` guard only establishes that the active role deals with
 * businesses at all.
 */
@Resolver()
export class BusinessResolver {
  constructor(
    private readonly access: BusinessAccessService,
    private readonly analytics: BusinessAnalyticsService,
    private readonly verification: BusinessVerificationService,
    private readonly team: TeamService,
  ) {}

  @RequirePermissions('business:manage')
  @Query(() => BusinessDashboardView, {
    description: 'Active posts, applications, in-progress/completed jobs and spend (BIZ-02).',
  })
  async businessDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Args('businessProfileId', { type: () => ID, nullable: true }) businessProfileId?: string,
  ): Promise<BusinessDashboardView> {
    const id = await this.resolveBusinessId(user, businessProfileId);
    return this.analytics.dashboard(user, id);
  }

  @RequirePermissions('business:manage')
  @Query(() => BusinessAnalyticsView, {
    description: 'Jobs posted, hire rate, spend and average rating (BIZ-03).',
  })
  async businessAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Args('businessProfileId', { type: () => ID, nullable: true }) businessProfileId?: string,
  ): Promise<BusinessAnalyticsView> {
    const id = await this.resolveBusinessId(user, businessProfileId);
    return this.analytics.analytics(user, id);
  }

  @RequirePermissions('business:manage')
  @Query(() => CompanyWalletView, {
    description:
      'The company wallet (BIZ-03) — a scoped view over the shared ledger, never a second balance.',
  })
  async companyWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Args('businessProfileId', { type: () => ID, nullable: true }) businessProfileId?: string,
  ): Promise<CompanyWalletView> {
    const id = await this.resolveBusinessId(user, businessProfileId);
    // Gated even for the totals: `companyWallet` itself takes no viewer, so the
    // capability check has to happen here rather than being assumed downstream.
    await this.access.require(user, id, 'business:view');
    return this.analytics.companyWallet(id);
  }

  @RequirePermissions('business:manage')
  @Query(() => [CompanyPaymentView], {
    description: 'Recent payments against the company’s jobs (BIZ-02). Finance-gated.',
  })
  async companyPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Args('businessProfileId', { type: () => ID, nullable: true }) businessProfileId?: string,
  ): Promise<CompanyPaymentView[]> {
    const id = await this.resolveBusinessId(user, businessProfileId);
    return this.analytics.companyPayments(user, id);
  }

  @RequirePermissions('business:manage')
  @Query(() => [TeamMemberView], { description: 'The team roster (BIZ-03).' })
  async businessTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Args('businessProfileId', { type: () => ID, nullable: true }) businessProfileId?: string,
  ): Promise<TeamMemberView[]> {
    const id = await this.resolveBusinessId(user, businessProfileId);
    return this.team.list(user, id);
  }

  @RequirePermissions('business:manage')
  @Query(() => CorporateEligibilityView, {
    description: 'Whether the company may take Tier-3-gated corporate engagements (BIZ-01).',
  })
  async corporateEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Args('businessProfileId', { type: () => ID, nullable: true }) businessProfileId?: string,
  ): Promise<CorporateEligibilityView> {
    const id = await this.resolveBusinessId(user, businessProfileId);
    await this.access.require(user, id, 'business:view');
    return this.verification.corporateEligibility(id);
  }

  @RequirePermissions('business:manage')
  @Query(() => BusinessAccessView, {
    description:
      'What the caller may do for this business (BIZ-03), so the UI renders the surface their access level allows rather than one that fails on submit.',
  })
  async myBusinessAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Args('businessProfileId', { type: () => ID, nullable: true }) businessProfileId?: string,
  ): Promise<BusinessAccessView> {
    const id = await this.resolveBusinessId(user, businessProfileId);
    const access = await this.access.require(user, id, 'business:view');

    return {
      businessProfileId: id,
      isOwner: access.isOwner,
      accessLevel: access.accessLevel,
      capabilities: [...capabilitiesFor(access)],
    };
  }

  /**
   * The business a query is about: the one named, or the caller's own.
   *
   * Falling back rather than requiring the id everywhere keeps the common case
   * (an owner opening their dashboard) a one-argument query, while
   * `resolveDefault` refuses to guess for anyone who belongs to several.
   */
  private async resolveBusinessId(
    user: AuthenticatedUser,
    businessProfileId?: string,
  ): Promise<string> {
    if (businessProfileId) {
      return businessProfileId;
    }
    const access = await this.access.resolveDefault(user.id);
    return access.businessProfileId;
  }
}
