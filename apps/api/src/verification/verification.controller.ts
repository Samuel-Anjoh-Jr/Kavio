import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import {
  advanceVerificationSchema,
  approveVerificationSchema,
  rejectVerificationSchema,
  requestInfoSchema,
  submitVerificationSchema,
  type AdvanceVerificationDto,
  type ApproveVerificationDto,
  type RejectVerificationDto,
  type RequestInfoDto,
  type SubmitVerificationDto,
} from './dto/verification.dto';
import { VerificationReviewService, type ReviewResult } from './verification-review.service';
import { VerificationService, type SubmissionResult } from './verification.service';

/**
 * Verification writes (REST, per the DUAL API RULE). Reads are GraphQL.
 *
 * Two audiences on one controller, separated by permission:
 *   verification:submit          the subject, sending their own documents
 *   admin:verification_review    agents and admins, deciding them
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

  // ───────────────────────────────────────────────────────────────────────────
  // Review actions (AGT-03, ADM-03)
  // ───────────────────────────────────────────────────────────────────────────

  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin:verification_review')
  async claim(
    @CurrentUser() reviewer: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ReviewResult> {
    return this.review.claim(id, reviewer);
  }

  /** Moves an item along the board. Decisions have their own endpoints. */
  @Post(':id/stage')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin:verification_review')
  async advance(
    @CurrentUser() reviewer: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(advanceVerificationSchema)) dto: AdvanceVerificationDto,
  ): Promise<ReviewResult> {
    return this.review.advance(id, dto.stage, reviewer, dto.note);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin:verification_review')
  async approve(
    @CurrentUser() reviewer: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(approveVerificationSchema)) dto: ApproveVerificationDto,
  ): Promise<ReviewResult> {
    return this.review.approve(id, reviewer, dto.note);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin:verification_review')
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
  @RequirePermissions('admin:verification_review')
  async requestInfo(
    @CurrentUser() reviewer: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(requestInfoSchema)) dto: RequestInfoDto,
  ): Promise<ReviewResult> {
    return this.review.requestMoreInfo(id, dto.infoRequest, reviewer);
  }
}
