import { Args, Query, Resolver } from '@nestjs/graphql';
import { OnboardingRole } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { Onboarding } from './models/onboarding.model';
import { OnboardingService } from './onboarding.service';

/**
 * Onboarding reads (GraphQL, per the DUAL API RULE). No @Public(), so the
 * global JwtAuthGuard applies — onboarding answers are private to their owner.
 */
@Resolver(() => Onboarding)
export class OnboardingResolver {
  constructor(private readonly service: OnboardingService) {}

  @Query(() => Onboarding, {
    name: 'onboarding',
    description: "The signed-in identity's onboarding progress for one role (ACC-10).",
  })
  async findOnboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Args('role', { type: () => OnboardingRole }) role: OnboardingRole,
  ): Promise<Onboarding> {
    this.service.assertRoleAllowed(user, role);
    return this.service.get(user.id, role);
  }
}
