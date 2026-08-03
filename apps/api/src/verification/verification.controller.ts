import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions, Roles } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import {
  advanceVerificationSchema,
  approveVerificationSchema,
  rejectVerificationSchema,
  requestFieldVisitSchema,
  requestInfoSchema,
  submitVerificationSchema,
  type AdvanceVerificationDto,
  type ApproveVerificationDto,
  type RejectVerificationDto,
  type RequestFieldVisitDto,
  type RequestInfoDto,
  type SubmitVerificationDto,
} from './dto/verification.dto';
import { VerificationReviewService, type ReviewResult } from './verification-review.service';
import { VerificationService, type SubmissionResult } from './verification.service';

/**
 * Verification writes (REST, per the DUAL API RULE). Reads are GraphQL.
 *
 * Two audiences on one controller, separated by permission:
 *   verification:submit    the subject, sending their own documents
 *   ADMIN or AGENT         reviewing and deciding them (AGT-03, ADM-03)
 *
 * The review actions are gated by @Roles rather than @RequirePermissions
 * deliberately: field agents and admins are the two roles that genuinely do
 * this job, not a delegable capability another role could be granted, and
 * there is no single permission both hold (AGENT carries
 * `verification:field_verify`, not `admin:verification_review` — requiring
 * the latter here would silently lock every field agent out of the board
 * their own role exists for).
 *
 * Every review action is RBAC-gated here AND audit-logged in the service. The
 * guard stops the request; the audit log answers for the ones that got through.
 */
@Controller('verifications')
export class VerificationController {
  constructor(
    private readonly verification: VerificationService,
    private readonly review: VerificationReviewService,
  ) {}

  /**
   * Submits documents for a check (TRU-06).
   *
   * Throttled tightly: a submission costs a reviewer's attention, and the honest
   * upper bound on how often a real person re-sends their ID is "a few times an
   * hour, when the photo was bad".
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('verification:submit')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(submitVerificationSchema)) dto: SubmitVerificationDto,
  ): Promise<SubmissionResult> {
    return this.verification.submit(user, dto.checkType, dto.documentIds);
  }

  /**
   * A worker asking to be queued for a Field Agent visit (TRU-05, AGT-01).
   *
   * Deliberately its own route rather than a `submit()` checkType, since
   * FIELD_VERIFICATION is `staffOnly` there for good reason (only an agent
   * settles it) — this is the one legitimate self-service action for it:
   * asking, not completing the check itself. Tightly throttled: a visit costs
   * an agent a trip, not a moment of attention.
   */
  @Post('field-visit')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('verification:submit')
  @Throttle({ default: { ttl: 86_400_000, limit: 3 } })
  async requestFieldVisit(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(requestFieldVisitSchema)) dto: RequestFieldVisitDto,
  ): Promise<SubmissionResult> {
    return this.verification.requestFieldVisit(user, dto.note);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Review actions (AGT-03, ADM-03)
  // ───────────────────────────────────────────────────────────────────────────

  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.AGENT)
  async claim(
    @CurrentUser() reviewer: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ReviewResult> {
    return this.review.claim(id, reviewer);
  }

  /** Moves an item along the board. Decisions have their own endpoints. */
  @Post(':id/stage')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.AGENT)
  async advance(
    @CurrentUser() reviewer: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(advanceVerificationSchema)) dto: AdvanceVerificationDto,
  ): Promise<ReviewResult> {
    return this.review.advance(id, dto.stage, reviewer, dto.note);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.AGENT)
  async approve(
    @CurrentUser() reviewer: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(approveVerificationSchema)) dto: ApproveVerificationDto,
  ): Promise<ReviewResult> {
    return this.review.approve(id, reviewer, dto.note);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.AGENT)
  async reject(
    @CurrentUser() reviewer: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(rejectVerificationSchema)) dto: RejectVerificationDto,
  ): Promise<ReviewResult> {
    return this.review.reject(id, dto.reason, reviewer, dto.note);
  }

  /** Asks the subject for more, without costing them their place in the queue. */
  @Post(':id/request-info')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.AGENT)
  async requestInfo(
    @CurrentUser() reviewer: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(requestInfoSchema)) dto: RequestInfoDto,
  ): Promise<ReviewResult> {
    return this.review.requestMoreInfo(id, dto.infoRequest, reviewer);
  }
}
