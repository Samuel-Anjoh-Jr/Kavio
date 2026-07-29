import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { OnboardingRole } from '@kavio/database';
import { z } from 'zod';
import { AppException } from '../lib/app-exception';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OnboardingService, type OnboardingView } from './onboarding.service';

/** The step payload is validated per-step in the service against its own schema. */
const saveStepSchema = z.object({
  step: z.string().trim().min(1).max(60),
  data: z.record(z.string(), z.unknown()),
});

type SaveStepDto = z.infer<typeof saveStepSchema>;

function parseRole(value: string): OnboardingRole {
  const role = value.toUpperCase();
  if (role in OnboardingRole) {
    return OnboardingRole[role as keyof typeof OnboardingRole];
  }
  throw new AppException(
    HttpStatus.NOT_FOUND,
    'UNKNOWN_ONBOARDING_ROLE',
    'Unknown onboarding flow.',
  );
}

/**
 * Onboarding writes (REST, per the DUAL API RULE). Reads are the `onboarding`
 * GraphQL query. Authenticated by default via the global JwtAuthGuard, and the
 * user id always comes from the token — never from the path.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** Autosave. Called on a debounce as the user fills each step in. */
  @Patch(':role/step')
  @HttpCode(HttpStatus.OK)
  async saveStep(
    @CurrentUser() user: AuthenticatedUser,
    @Param('role') roleParam: string,
    @Body(new ZodValidationPipe(saveStepSchema)) dto: SaveStepDto,
  ): Promise<OnboardingView> {
    const role = parseRole(roleParam);
    this.onboarding.assertRoleAllowed(user, role);

    return this.onboarding.saveStep(user.id, role, dto.step, dto.data);
  }

  @Post(':role/complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('role') roleParam: string,
  ): Promise<OnboardingView> {
    const role = parseRole(roleParam);
    this.onboarding.assertRoleAllowed(user, role);

    return this.onboarding.complete(user.id, role);
  }
}
