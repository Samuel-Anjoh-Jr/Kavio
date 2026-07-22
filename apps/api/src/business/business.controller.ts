import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { BusinessVerificationService } from './business-verification.service';
import {
  invitationTokenSchema,
  inviteTeamMemberSchema,
  updateTeamMemberSchema,
  type InvitationTokenDto,
  type InviteTeamMemberDto,
  type UpdateTeamMemberDto,
} from './dto/team.dto';
import { TeamService } from './team.service';

/** RCCM papers, already uploaded as BUSINESS_REGISTRATION assets (BIZ-01). */
const submitRegistrationSchema = z.object({
  documentIds: z
    .array(z.uuid())
    .min(1, 'Attach your registration document.')
    .max(5, 'Attach up to 5 documents.'),
});
type SubmitRegistrationDto = z.infer<typeof submitRegistrationSchema>;

/**
 * Business & team WRITES (REST, per the DUAL API RULE; BIZ-01, BIZ-03). Reads
 * are on the business resolver.
 *
 * TWO LAYERS OF AUTHORISATION, and both are needed:
 *
 *   - `@RequirePermissions('business:manage' | 'business:team_manage')` is the
 *     RBAC guard. It answers "does this ROLE deal with businesses at all", which
 *     keeps a Worker's active session off these routes entirely.
 *   - `BusinessAccessService.require(...)` inside each service answers the
 *     question that actually matters: does THIS identity hold THIS capability
 *     for THIS company. That check is what BIZ-03's access levels are, and it
 *     cannot live in a guard because the target business comes from the path.
 *
 * Accepting an invitation is deliberately outside both: the invitee is not a
 * member yet — that is what they are trying to become — so the token is the
 * authorisation, and it is one-time, hashed at rest and expiring.
 */
@Controller('businesses')
export class BusinessController {
  constructor(
    private readonly team: TeamService,
    private readonly verification: BusinessVerificationService,
  ) {}

  // ── Verification (BIZ-01) ────────────────────────────────────────────────────

  /** Sends the company's registration papers to the ADM-03 review queue. */
  @Post(':id/verification')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('business:manage')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async submitRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(submitRegistrationSchema)) dto: SubmitRegistrationDto,
  ) {
    return this.verification.submitRegistration(user, id, dto.documentIds);
  }

  // ── Team (BIZ-03) ────────────────────────────────────────────────────────────

  /**
   * Invites a colleague (BIZ-03).
   *
   * The response carries the invitation token EXACTLY ONCE — after this returns,
   * only its digest exists and the token cannot be recovered.
   */
  @Post(':id/team')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('business:team_manage')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(inviteTeamMemberSchema)) dto: InviteTeamMemberDto,
  ) {
    return this.team.invite(user, id, dto);
  }

  @Patch(':id/team/:memberId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('business:team_manage')
  async updateMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Body(new ZodValidationPipe(updateTeamMemberSchema)) dto: UpdateTeamMemberDto,
  ) {
    return this.team.update(user, id, memberId, dto);
  }

  @Delete(':id/team/:memberId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('business:team_manage')
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
  ) {
    return this.team.remove(user, id, memberId);
  }

  // ── Invitations (BIZ-03) ─────────────────────────────────────────────────────

  /**
   * Accepts an invitation, binding the seat to the caller's identity.
   *
   * No business permission required — the invitee is not a member yet, and
   * demanding the capability they are being granted would make every invitation
   * unacceptable. The one-time token is the authorisation. Throttled tightly
   * because this is the one endpoint where a token is guessed at.
   */
  @Post('team/invitations/accept')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async acceptInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(invitationTokenSchema)) dto: InvitationTokenDto,
  ) {
    return this.team.acceptInvitation(user, dto.token);
  }

  @Post('team/invitations/decline')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async declineInvitation(
    @Body(new ZodValidationPipe(invitationTokenSchema)) dto: InvitationTokenDto,
  ) {
    return this.team.declineInvitation(dto.token);
  }
}
