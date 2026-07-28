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
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import {
  createFaqSchema,
  createPortfolioItemSchema,
  createTestimonialSchema,
  reorderSchema,
  updateFaqSchema,
  updatePortfolioItemSchema,
  updateTestimonialSchema,
  type CreateFaqDto,
  type CreatePortfolioItemDto,
  type CreateTestimonialDto,
  type ReorderDto,
  type UpdateFaqDto,
  type UpdatePortfolioItemDto,
  type UpdateTestimonialDto,
} from './dto/marketing.dto';
import { MarketingService } from './marketing.service';
import type { FaqView, PortfolioShowcaseView, TestimonialView } from './models/marketing.model';

/**
 * Marketing-content WRITES (REST, per the DUAL API RULE). Reads — including the
 * admin console's own lists — are on the GraphQL resolver.
 *
 * Gated on `admin:settings_manage` rather than on the ADMIN role name: this is
 * platform content configuration, and stating the capability means handing a
 * future Marketing role this one power is a change in the permission table
 * alone, not a sweep through controllers (NFR-SEC-02).
 *
 * Unlike the service taxonomy, DELETE is real here. Nothing references these
 * rows, so a testimonial withdrawn at its author's request has to actually
 * disappear — a soft-delete flag would be a promise we could not keep.
 */
@Controller('admin/marketing')
@RequirePermissions('admin:settings_manage')
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  // ── FAQ ────────────────────────────────────────────────────────────────────

  @Post('faqs')
  @HttpCode(HttpStatus.CREATED)
  async createFaq(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createFaqSchema)) dto: CreateFaqDto,
  ): Promise<FaqView> {
    return this.marketing.createFaq(dto, actor);
  }

  @Patch('faqs/:id')
  @HttpCode(HttpStatus.OK)
  async updateFaq(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateFaqSchema)) dto: UpdateFaqDto,
  ): Promise<FaqView> {
    return this.marketing.updateFaq(id, dto, actor);
  }

  @Delete('faqs/:id')
  @HttpCode(HttpStatus.OK)
  async deleteFaq(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ id: string }> {
    return this.marketing.deleteFaq(id, actor);
  }

  /**
   * A POST to a collection sub-resource rather than a PATCH on each entry: the
   * whole ordering is one atomic intent, and N requests would let a visitor load
   * the page against a half-applied order.
   */
  @Post('faqs/reorder')
  @HttpCode(HttpStatus.OK)
  async reorderFaqs(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(reorderSchema)) dto: ReorderDto,
  ): Promise<FaqView[]> {
    return this.marketing.reorderFaqs(dto, actor);
  }

  // ── Testimonials ───────────────────────────────────────────────────────────

  @Post('testimonials')
  @HttpCode(HttpStatus.CREATED)
  async createTestimonial(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createTestimonialSchema)) dto: CreateTestimonialDto,
  ): Promise<TestimonialView> {
    return this.marketing.createTestimonial(dto, actor);
  }

  @Patch('testimonials/:id')
  @HttpCode(HttpStatus.OK)
  async updateTestimonial(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateTestimonialSchema)) dto: UpdateTestimonialDto,
  ): Promise<TestimonialView> {
    return this.marketing.updateTestimonial(id, dto, actor);
  }

  @Delete('testimonials/:id')
  @HttpCode(HttpStatus.OK)
  async deleteTestimonial(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ id: string }> {
    return this.marketing.deleteTestimonial(id, actor);
  }

  @Post('testimonials/reorder')
  @HttpCode(HttpStatus.OK)
  async reorderTestimonials(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(reorderSchema)) dto: ReorderDto,
  ): Promise<TestimonialView[]> {
    return this.marketing.reorderTestimonials(dto, actor);
  }

  // ── Portfolio showcase ─────────────────────────────────────────────────────

  @Post('portfolio')
  @HttpCode(HttpStatus.CREATED)
  async createPortfolioItem(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPortfolioItemSchema)) dto: CreatePortfolioItemDto,
  ): Promise<PortfolioShowcaseView> {
    return this.marketing.createPortfolioItem(dto, actor);
  }

  @Patch('portfolio/:id')
  @HttpCode(HttpStatus.OK)
  async updatePortfolioItem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updatePortfolioItemSchema)) dto: UpdatePortfolioItemDto,
  ): Promise<PortfolioShowcaseView> {
    return this.marketing.updatePortfolioItem(id, dto, actor);
  }

  @Delete('portfolio/:id')
  @HttpCode(HttpStatus.OK)
  async deletePortfolioItem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ id: string }> {
    return this.marketing.deletePortfolioItem(id, actor);
  }

  @Post('portfolio/reorder')
  @HttpCode(HttpStatus.OK)
  async reorderPortfolio(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(reorderSchema)) dto: ReorderDto,
  ): Promise<PortfolioShowcaseView[]> {
    return this.marketing.reorderPortfolio(dto, actor);
  }
}
