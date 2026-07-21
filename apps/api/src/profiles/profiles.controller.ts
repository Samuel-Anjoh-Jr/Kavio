import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { AvailabilityService } from './availability.service';
import {
  addPortfolioItemSchema,
  createServiceSchema,
  reorderPortfolioSchema,
  setAvailabilityExceptionSchema,
  setAvailabilitySchema,
  updateBusinessProfileSchema,
  updatePortfolioItemSchema,
  updateServiceSchema,
  updateWorkerProfileSchema,
  type AddPortfolioItemDto,
  type CreateServiceDto,
  type ReorderPortfolioDto,
  type SetAvailabilityDto,
  type SetAvailabilityExceptionDto,
  type UpdateBusinessProfileDto,
  type UpdatePortfolioItemDto,
  type UpdateServiceDto,
  type UpdateWorkerProfileDto,
} from './dto/profile-management.dto';
import { PortfolioService } from './portfolio.service';
import { ProfileEditService } from './profile-edit.service';
import { WorkerServicesService } from './worker-services.service';

/**
 * Owner edit flows (PROMPT 48; PRO-05, PRO-07). REST, per the DUAL API RULE —
 * every read of a profile is on the GraphQL resolver.
 *
 * Authenticated by default (the global JwtAuthGuard) and additionally gated per
 * capability. Note what is NOT in any route below: an id identifying WHOSE
 * profile is being edited. The target is always derived from the token, so
 * "edit someone else's portfolio" is not a request this API can express.
 *
 * The GET routes here are the OWNER's editing view — the draft state, including
 * inactive services and past-dated exceptions that the public read filters out.
 * They are on REST rather than GraphQL because they exist to round-trip a form,
 * not to feed the Apollo cache the public profile is built from.
 */
@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly edit: ProfileEditService,
    private readonly services: WorkerServicesService,
    private readonly portfolio: PortfolioService,
    private readonly availability: AvailabilityService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Profile details (PRO-07)
  // ───────────────────────────────────────────────────────────────────────────

  @Patch('worker')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('profile:manage')
  async updateWorkerProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateWorkerProfileSchema)) dto: UpdateWorkerProfileDto,
  ) {
    return this.edit.updateWorkerProfile(user, dto);
  }

  @Patch('business')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('business:manage')
  async updateBusinessProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateBusinessProfileSchema)) dto: UpdateBusinessProfileDto,
  ) {
    return this.edit.updateBusinessProfile(user, dto);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Services (PRO-05)
  // ───────────────────────────────────────────────────────────────────────────

  @Get('worker/services')
  @RequirePermissions('service:manage')
  async listServices(@CurrentUser() user: AuthenticatedUser) {
    return this.services.list(user);
  }

  @Post('worker/services')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('service:manage')
  async createService(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createServiceSchema)) dto: CreateServiceDto,
  ) {
    return this.services.create(user, dto);
  }

  @Patch('worker/services/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('service:manage')
  async updateService(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateServiceSchema)) dto: UpdateServiceDto,
  ) {
    return this.services.update(user, id, dto);
  }

  @Delete('worker/services/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('service:manage')
  async removeService(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.services.remove(user, id);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Portfolio (PRO-02)
  // ───────────────────────────────────────────────────────────────────────────

  @Get('worker/portfolio')
  @RequirePermissions('portfolio:manage')
  async listPortfolio(@CurrentUser() user: AuthenticatedUser) {
    return this.portfolio.list(user);
  }

  /**
   * Attaches an ALREADY-UPLOADED asset to the gallery.
   *
   * Two steps rather than one multipart call, deliberately: the bytes go to
   * POST /uploads, which reports progress and validates the file, and this call
   * is the cheap, retryable metadata write. On a connection that drops halfway
   * — the normal case on mobile data here — a failed attach costs a request, not
   * a re-upload of a 6 MB photo.
   */
  @Post('worker/portfolio')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('portfolio:manage')
  async addPortfolioItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(addPortfolioItemSchema)) dto: AddPortfolioItemDto,
  ) {
    return this.portfolio.add(user, dto);
  }

  @Patch('worker/portfolio/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('portfolio:manage')
  async updatePortfolioItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updatePortfolioItemSchema)) dto: UpdatePortfolioItemDto,
  ) {
    return this.portfolio.update(user, id, dto);
  }

  @Delete('worker/portfolio/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('portfolio:manage')
  async removePortfolioItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.portfolio.remove(user, id);
  }

  @Post('worker/portfolio/reorder')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('portfolio:manage')
  async reorderPortfolio(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(reorderPortfolioSchema)) dto: ReorderPortfolioDto,
  ) {
    return { reordered: await this.portfolio.reorder(user, dto) };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Availability (PRO-05)
  // ───────────────────────────────────────────────────────────────────────────

  @Get('worker/availability')
  @RequirePermissions('availability:manage')
  async getAvailability(@CurrentUser() user: AuthenticatedUser) {
    return this.availability.get(user);
  }

  /**
   * PUT, not PATCH: this replaces the whole week. The verb is the contract —
   * a caller sending three slots is saying "these three ARE my week", and
   * PATCH would imply the other days survive.
   */
  @Put('worker/availability')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('availability:manage')
  async setAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(setAvailabilitySchema)) dto: SetAvailabilityDto,
  ) {
    return { slots: await this.availability.setWeek(user, dto) };
  }

  @Put('worker/availability/exceptions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('availability:manage')
  async setAvailabilityException(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(setAvailabilityExceptionSchema)) dto: SetAvailabilityExceptionDto,
  ) {
    return this.availability.setException(user, dto);
  }

  @Delete('worker/availability/exceptions/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('availability:manage')
  async removeAvailabilityException(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.availability.removeException(user, id);
  }
}
