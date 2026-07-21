import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { foundingIntakeSchema, type FoundingIntakeDto } from './dto/verification.dto';
import { FoundingProfessionalService, type FoundingIntakeResult } from './founding.service';

/**
 * Founding Professional intake (P31; TRU-09, AGT-01).
 *
 * REST write, gated on `agent:onboard_worker` — a permission only AGENT and
 * ADMIN hold. This endpoint can create an account and assert an in-person
 * verification, which makes it the most powerful write in the Trust Engine: it
 * is the one place where a human's word enters the ledger directly. Hence the
 * permission gate, the audit entry, and a throttle that suits a person filling
 * in a form in a workshop rather than a script.
 */
@Controller('agent/founding-professionals')
export class FoundingProfessionalController {
  constructor(private readonly founding: FoundingProfessionalService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('agent:onboard_worker')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async intake(
    @CurrentUser() agent: AuthenticatedUser,
    @Body(new ZodValidationPipe(foundingIntakeSchema)) dto: FoundingIntakeDto,
  ): Promise<FoundingIntakeResult> {
    return this.founding.intake(dto, agent);
  }
}
