import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { ApplicationsService } from './applications.service';
import {
  applyToJobSchema,
  inviteWorkerSchema,
  updateApplicationStatusSchema,
  type ApplyToJobDto,
  type InviteWorkerDto,
  type UpdateApplicationStatusDto,
} from './dto/application.dto';
import {
  createJobSchema,
  patchJobSchema,
  transitionJobSchema,
  type CreateJobDto,
  type PatchJobDto,
  type TransitionJobDto,
} from './dto/job.dto';
import { InvitationsService } from './invitations.service';
import { JobsService } from './jobs.service';

/**
 * Job WRITES (REST, per the DUAL API RULE). Every read is on JobsResolver.
 *
 * The capability split is the RBAC contract for the marketplace:
 *   job:create      — post and run a job (Client, Business)
 *   job:manage_own  — move a job the caller posted through its lifecycle
 *   job:apply       — apply to a job, respond to an invitation (Worker)
 *
 * Posting is gated TWICE: once here by `job:create` (are you a role that hires?)
 * and again inside publish() by the Tier 2+ verification gate (have you proven
 * who you are?). The two are different questions and both must pass.
 */
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly applications: ApplicationsService,
    private readonly invitations: InvitationsService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Posting and lifecycle (JOB-01, JOB-02, JOB-05, JOB-07)
  // ───────────────────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('job:create')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createJobSchema)) dto: CreateJobDto,
  ) {
    return this.jobs.createDraft(user, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('job:manage_own')
  async patch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(patchJobSchema)) dto: PatchJobDto,
  ) {
    return this.jobs.patchDraft(user, id, dto);
  }

  /**
   * Publishes a draft. The 403 this can throw is the anti-lure gate (JOB-01):
   * its body carries the exact verification steps the poster still needs, so the
   * client turns the refusal into a checklist rather than a wall.
   */
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('job:create')
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.publish(user, id);
  }

  /**
   * A lifecycle transition (JOB-05). The service decides whether this caller is
   * the poster or the hired worker and whether the state machine permits the
   * move; an illegal one is a 409, not a silent no-op.
   */
  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('job:manage_own')
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(transitionJobSchema)) dto: TransitionJobDto,
  ) {
    return this.jobs.transition(user, id, dto.to, dto.note);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Applications (JOB-04)
  // ───────────────────────────────────────────────────────────────────────────

  @Post(':id/applications')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('job:apply')
  async apply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(applyToJobSchema)) dto: ApplyToJobDto,
  ) {
    return this.applications.apply(user, id, dto);
  }

  @Post('applications/:applicationId/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('job:apply')
  async withdrawApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
  ) {
    return this.applications.withdraw(user, applicationId);
  }

  /** The poster triages an applicant (JOB-04). */
  @Patch('applications/:applicationId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('job:manage_own')
  async updateApplicationStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Body(new ZodValidationPipe(updateApplicationStatusSchema)) dto: UpdateApplicationStatusDto,
  ) {
    return this.applications.updateStatus(user, applicationId, dto);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Invitations (JOB-03)
  // ───────────────────────────────────────────────────────────────────────────

  @Post(':id/invitations')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('job:manage_own')
  async invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(inviteWorkerSchema)) dto: InviteWorkerDto,
  ) {
    return this.invitations.invite(user, id, dto);
  }

  @Post('invitations/:invitationId/accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('job:apply')
  async acceptInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.invitations.respond(user, invitationId, true);
  }

  @Post('invitations/:invitationId/decline')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('job:apply')
  async declineInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.invitations.respond(user, invitationId, false);
  }

  @Post('invitations/:invitationId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('job:manage_own')
  async cancelInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.invitations.cancel(user, invitationId);
  }
}
