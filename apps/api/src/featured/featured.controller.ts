import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions, Roles } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import {
  approveFeaturedSchema,
  rejectFeaturedSchema,
  reviewNoteSchema,
  type ApproveFeaturedDto,
  type RejectFeaturedDto,
  type ReviewNoteDto,
} from './dto/featured.dto';
import { FeaturedService, type FeaturedListingResult } from './featured.service';

/**
 * Sponsored ranking placement writes (REST, per the DUAL API RULE). Reads are
 * GraphQL.
 *
 * Two audiences on one controller, separated by permission:
 *   featured:request   the worker/business, asking to be featured
 *   ADMIN              reviewing, deciding a price, and (later) revoking
 *
 * Pause/resume are self-or-admin: the subject can step back from a placement
 * they are paying extra commission on without waiting on staff, and an admin
 * can do it for them (e.g. while investigating a complaint).
 */
@Controller('featured')
export class FeaturedController {
  constructor(private readonly featured: FeaturedService) {}

  /**
   * A worker/business asks to be featured. Rare and consequential (it puts
   * them in front of an admin, not a queue of jobs), so it is throttled like
   * the comparable field-visit request rather than an everyday write.
   */
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('featured:request')
  @Throttle({ default: { ttl: 86_400_000, limit: 3 } })
  async request(@CurrentUser() user: AuthenticatedUser): Promise<FeaturedListingResult> {
    return this.featured.request(user);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Admin review
  // ───────────────────────────────────────────────────────────────────────────

  @Post(':userId/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  async approve(
    @CurrentUser() reviewer: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(approveFeaturedSchema)) dto: ApproveFeaturedDto,
  ): Promise<FeaturedListingResult> {
    return this.featured.approve(userId, reviewer, dto.extraCommissionBps, dto.note);
  }

  @Post(':userId/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  async reject(
    @CurrentUser() reviewer: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(rejectFeaturedSchema)) dto: RejectFeaturedDto,
  ): Promise<FeaturedListingResult> {
    return this.featured.reject(userId, reviewer, dto.reason, dto.note);
  }

  @Post(':userId/revoke')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  async revoke(
    @CurrentUser() reviewer: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(reviewNoteSchema)) dto: ReviewNoteDto,
  ): Promise<FeaturedListingResult> {
    return this.featured.revoke(userId, reviewer, dto.note);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Self-or-admin
  // ───────────────────────────────────────────────────────────────────────────

  @Post(':userId/pause')
  @HttpCode(HttpStatus.OK)
  async pause(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<FeaturedListingResult> {
    return this.featured.pause(userId, actor);
  }

  @Post(':userId/resume')
  @HttpCode(HttpStatus.OK)
  async resume(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<FeaturedListingResult> {
    return this.featured.resume(userId, actor);
  }
}
