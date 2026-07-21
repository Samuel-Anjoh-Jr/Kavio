import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/decorators/auth.decorators';
import { CatalogService } from './catalog.service';
import { ServiceCategoryTreeView, ServiceCategoryView } from './models/catalog.model';

/**
 * Taxonomy READS (GraphQL, per the DUAL API RULE). Writes are REST.
 *
 * Every query is @Public(): browsing what trades exist is the first thing a
 * visitor does, long before they have a reason to make an account (ACC-01), and
 * job posting and search are both scoped to this list.
 *
 * `includeInactive` is the one privileged corner. It is accepted here but
 * ENFORCED in the service against the optional viewer — JwtAuthGuard attaches
 * the identity even on public routes when a token is present, so an admin
 * console gets retired categories from the same query the marketing site uses.
 */
@Resolver(() => ServiceCategoryView)
export class CatalogResolver {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Query(() => [ServiceCategoryView], {
    description:
      'Service categories, in admin-chosen order. Pass parentId for one trade’s specialisations, or topLevelOnly for the trades themselves (ADM-02, DIS-05).',
  })
  async serviceCategories(
    @CurrentUser() viewer: AuthenticatedUser | undefined,
    @Args('parentId', { type: () => ID, nullable: true }) parentId?: string,
    @Args('topLevelOnly', { nullable: true }) topLevelOnly?: boolean,
    @Args('includeInactive', {
      nullable: true,
      description: 'Admin only — includes retired categories.',
    })
    includeInactive?: boolean,
  ): Promise<ServiceCategoryView[]> {
    return this.catalog.list({ parentId, topLevelOnly, includeInactive, viewer });
  }

  @Public()
  @Query(() => [ServiceCategoryTreeView], {
    description:
      'The whole taxonomy as trades with their specialisations, in one round trip (DIS-05).',
  })
  async serviceCategoryTree(
    @CurrentUser() viewer: AuthenticatedUser | undefined,
    @Args('includeInactive', { nullable: true }) includeInactive?: boolean,
  ): Promise<ServiceCategoryTreeView[]> {
    return this.catalog.tree({ includeInactive, viewer });
  }

  @Public()
  @Query(() => ServiceCategoryView, {
    description:
      'One category by id or slug. A retired category still resolves, so an old job post or a shared link never breaks.',
  })
  async serviceCategory(
    @CurrentUser() viewer: AuthenticatedUser | undefined,
    @Args('id', { type: () => ID, nullable: true }) id?: string,
    @Args('slug', { nullable: true }) slug?: string,
  ): Promise<ServiceCategoryView> {
    return this.catalog.findOne({ id, slug }, viewer);
  }
}
