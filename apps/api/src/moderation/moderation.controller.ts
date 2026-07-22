import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import {
  createReportSchema,
  moderationActionSchema,
  reviewReportGroupSchema,
  type CreateReportDto,
  type ModerationActionDto,
  type ReviewReportGroupDto,
} from './dto/report.dto';
import { ModerationService } from './moderation.service';

/**
 * Reporting & moderation WRITES (REST, per the DUAL API RULE; ADM-08). Reads are
 * on ModerationResolver.
 *
 * Filing a report carries NO capability decorator, on purpose: reporting belongs
 * to the identity, exactly like wallet and safety endpoints, and a user who cannot
 * report abuse is a safety hole rather than a tidy permission model. It is
 * throttled instead, which is the actual risk (flooding), not authorisation.
 *
 * Everything downstream of a report needs `admin:moderate`.
 */
@Controller()
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  /** Report anything you can see (ADM-08). */
  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createReportSchema)) dto: CreateReportDto,
  ) {
    return this.moderation.createReport(user, dto);
  }

  /** Picks a case up (or puts it back) without deciding it (ADM-08). */
  @Post('admin/moderation/review')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin:moderate')
  async review(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(new ZodValidationPipe(reviewReportGroupSchema)) dto: ReviewReportGroupDto,
  ) {
    return this.moderation.reviewGroup(admin, dto);
  }

  /**
   * Decides a case: records the action, applies it, and closes every open report
   * about the item in one call (ADM-08).
   */
  @Post('admin/moderation/actions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('admin:moderate')
  async act(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(new ZodValidationPipe(moderationActionSchema)) dto: ModerationActionDto,
  ) {
    return this.moderation.act(admin, dto);
  }
}
