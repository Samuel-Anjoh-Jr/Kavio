import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { Public } from '../auth/decorators/auth.decorators';
import { BusinessProfileService } from './business-profile.service';
import { BusinessProfileView } from './models/business-profile.model';
import { WorkerProfileView } from './models/worker-profile.model';
import { WorkerProfileService } from './worker-profile.service';

/**
 * Profile READS (GraphQL, per the DUAL API RULE). Owner edits are REST.
 *
 * @Public() throughout: the guest first-interface lets an unauthenticated
 * visitor open a FULL worker profile (ACC-01), because seeing real evidence from
 * a real tradesperson is the argument for signing up. The login wall stands at
 * the actions — message, quote, book, save — not at the reading.
 *
 * Both queries accept either the profile id or the identity id. Search returns
 * both, and shared links historically carry the user id; supporting the pair
 * here means neither surface has to do a lookup first.
 */
@Resolver()
export class ProfilesResolver {
  constructor(
    private readonly workers: WorkerProfileService,
    private readonly businesses: BusinessProfileService,
  ) {}

  @Public()
  @Query(() => WorkerProfileView, {
    description:
      'The full public worker profile in one round trip: trust inputs, stats, services, portfolio, availability, verifications and endorsements (PRO-01, PRO-02, PRO-03).',
  })
  async workerProfile(
    @Args('id', { type: () => ID, nullable: true, description: 'WorkerProfile id.' }) id?: string,
    @Args('userId', { type: () => ID, nullable: true, description: 'Identity id.' })
    userId?: string,
  ): Promise<WorkerProfileView> {
    return userId ? this.workers.findByUserId(userId) : this.workers.findById(id ?? '');
  }

  @Public()
  @Query(() => BusinessProfileView, {
    description:
      'The public company profile with its About/Jobs/Reviews/Team/Documents data (PRO-06). The Documents tab reports verified claims, never the files themselves.',
  })
  async businessProfile(
    @Args('id', { type: () => ID, nullable: true }) id?: string,
    @Args('ownerId', { type: () => ID, nullable: true }) ownerId?: string,
  ): Promise<BusinessProfileView> {
    return ownerId ? this.businesses.findByOwnerId(ownerId) : this.businesses.findById(id ?? '');
  }
}
