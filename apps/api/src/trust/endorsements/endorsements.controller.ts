import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../../lib/zod-validation.pipe';
import {
  createEndorsementSchema,
  revokeEndorsementSchema,
  type CreateEndorsementDto,
  type RevokeEndorsementDto,
} from '../../verification/dto/verification.dto';
import { EndorsementService } from './endorsement.service';

/**
 * Endorsement writes (REST, per the DUAL API RULE). Reads are GraphQL.
 *
 * Gated on `endorsement:give`. Rate-limited hard: an endorsement costs the
 * author nothing to write and is worth points to the subject, which is the exact
 * shape of something that gets farmed. The structural defences (one per author
 * per subject, no self-endorsement, the cap, the taper) are what actually hold —
 * the throttle just makes the attempt tedious.
 */
@Controller('endorsements')
export class EndorsementsController {
  constructor(private readonly endorsements: EndorsementService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('endorsement:give')
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  async create(
    @CurrentUser() author: AuthenticatedUser,
    @Body(new ZodValidationPipe(createEndorsementSchema)) dto: CreateEndorsementDto,
  ) {
    return this.endorsements.create(dto, author);
  }

  /**
   * Withdraws an endorsement. Open to the author (retracting) and to staff
   * (moderating) — the service decides which of those the caller is, because
   * "may I revoke this particular row" is not a question a route decorator can
   * answer.
   */
  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(revokeEndorsementSchema)) dto: RevokeEndorsementDto,
  ) {
    return this.endorsements.revoke(id, actor, dto.note);
  }
}
