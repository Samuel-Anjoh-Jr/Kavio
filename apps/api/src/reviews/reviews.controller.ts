import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import {
  createReviewSchema,
  hideReviewSchema,
  reportReviewSchema,
  type CreateReviewDto,
  type HideReviewDto,
  type ReportReviewDto,
} from './dto/review.dto';
import { ReviewsService } from './reviews.service';

/**
 * Review WRITES (REST, per the DUAL API RULE; REV-01, REV-03). Reads are on the
 * reviews resolver.
 *
 * Two audiences on one controller, separated by permission:
 *   review:create      the two parties to a completed job, rating each other
 *   admin:user_manage  moderation taking a review down or putting it back
 *
 * `review:create` is held by Client, Worker and Business alike — REV-01 is
 * explicit that the worker may review the client back, and a permission granted
 * to only one side would make that half of the requirement unreachable. Which of
 * the two the caller actually is, is decided against the booking in the service,
 * not by the guard.
 */
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /**
   * Leaves a review on a completed job (REV-01).
   *
   * Throttled: a review is a once-per-job action, so anything beyond a handful a
   * minute is a retry loop or an attempt to find an eligibility hole.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('review:create')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createReviewSchema)) dto: CreateReviewDto,
  ) {
    return this.reviews.create(user, dto);
  }

  /**
   * Reports a review to the moderation queue (REV-03).
   *
   * No capability gate: anyone signed in who can see a review can report it, and
   * a report is a request for attention, not an action. Throttled instead, which
   * is the right control for something whose only abuse is volume.
   */
  @Post(':id/report')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(reportReviewSchema)) dto: ReportReviewDto,
  ) {
    return this.reviews.report(user, id, dto);
  }

  /** Takes a review down (REV-03, admin). Withdraws its trust contribution. */
  @Post(':id/hide')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin:user_manage')
  async hide(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(hideReviewSchema)) dto: HideReviewDto,
  ) {
    return this.reviews.hide(admin, id, dto);
  }

  /** Reinstates a review moderation had hidden (REV-03, admin). */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin:user_manage')
  async restore(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.reviews.restore(admin, id);
  }
}
