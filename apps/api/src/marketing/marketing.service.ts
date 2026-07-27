import { HttpStatus, Injectable } from '@nestjs/common';
import type { Faq, PortfolioShowcase, Prisma, Testimonial } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { roleHasPermission } from '../auth/rbac/permissions';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateFaqDto,
  CreatePortfolioItemDto,
  CreateTestimonialDto,
  ReorderDto,
  UpdateFaqDto,
  UpdatePortfolioItemDto,
  UpdateTestimonialDto,
} from './dto/marketing.dto';
import { toStarBreakdown } from './star-rating.util';
import type { FaqView, PortfolioItemView, TestimonialView } from './models/marketing.model';

const logger = createLogger('marketing');

/**
 * Marketing content: the landing page's FAQ and testimonials (PROMPT 92.1;
 * SRS §26.2).
 *
 * Two rules shape everything here:
 *
 *   1. PUBLIC READS RETURN ONLY PUBLISHED/VISIBLE ROWS, and that filter lives in
 *      this service rather than at the resolver. A draft answer about refund
 *      policy leaking onto the conversion surface is a legal problem, not a
 *      cosmetic one, so the check sits next to the query where a second caller
 *      cannot forget it.
 *   2. RATINGS ARE RESOLVED TO STARS HERE. The requirement says "always computed
 *      server-side" and this is the one place that computes them.
 *
 * Unlike the service taxonomy, these rows ARE deletable. Nothing references
 * them — no job, no listing, no saved filter — so a testimonial removed at the
 * author's request must actually go, and a soft-delete flag would be a promise
 * the product could not keep.
 */
@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Reads (GraphQL)
  // ───────────────────────────────────────────────────────────────────────────

  async listFaqs(options: {
    category?: string | null;
    includeUnpublished?: boolean;
    viewer?: AuthenticatedUser;
  }): Promise<FaqView[]> {
    const includeUnpublished = this.resolvePrivilegedView(
      options.includeUnpublished,
      options.viewer,
    );

    const rows = await this.prisma.client.faq.findMany({
      where: {
        ...(includeUnpublished ? {} : { isPublished: true }),
        ...(options.category ? { category: options.category } : {}),
      },
      // `id` breaks ties so a page reload cannot reshuffle two entries an admin
      // gave the same order.
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toFaqView);
  }

  async listTestimonials(options: {
    includeHidden?: boolean;
    viewer?: AuthenticatedUser;
  }): Promise<TestimonialView[]> {
    const includeHidden = this.resolvePrivilegedView(options.includeHidden, options.viewer);

    const rows = await this.prisma.client.testimonial.findMany({
      where: includeHidden ? {} : { visible: true },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toTestimonialView);
  }

  async listPortfolio(options: {
    includeUnpublished?: boolean;
    viewer?: AuthenticatedUser;
  }): Promise<PortfolioItemView[]> {
    const includeUnpublished = this.resolvePrivilegedView(
      options.includeUnpublished,
      options.viewer,
    );

    const rows = await this.prisma.client.portfolioShowcase.findMany({
      where: includeUnpublished ? {} : { isPublished: true },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toPortfolioItemView);
  }

  /**
   * Whether the caller may see unpublished/hidden rows.
   *
   * JwtAuthGuard attaches an identity even on @Public() routes when a token is
   * present, so the admin console reads its own list through the very same
   * public query the landing page uses — no second resolver, no chance of the
   * two drifting apart.
   */
  private resolvePrivilegedView(
    requested: boolean | undefined,
    viewer?: AuthenticatedUser,
  ): boolean {
    if (!requested || !viewer) return false;
    // Permissions derive from the ACTIVE role, never from the set of roles held —
    // an admin browsing as a Client is a client, and must see the public FAQ.
    return roleHasPermission(viewer.activeRole, 'admin:settings_manage');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Writes (REST, admin only)
  // ───────────────────────────────────────────────────────────────────────────

  async createFaq(dto: CreateFaqDto, actor: AuthenticatedUser): Promise<FaqView> {
    const row = await this.prisma.client.faq.create({
      data: {
        questionEn: dto.questionEn,
        questionFr: dto.questionFr,
        answerEn: dto.answerEn,
        answerFr: dto.answerFr,
        category: dto.category ?? null,
        order: dto.order ?? (await this.nextOrder('faq')),
        isPublished: dto.isPublished ?? true,
      },
    });

    await this.audit(actor, 'marketing.faq_created', `Faq:${row.id}`, {
      questionEn: row.questionEn,
    });
    logger.info('FAQ entry created', { payload: { id: row.id, actorId: actor.id } });

    return toFaqView(row);
  }

  async updateFaq(id: string, dto: UpdateFaqDto, actor: AuthenticatedUser): Promise<FaqView> {
    await this.requireFaq(id);

    const row = await this.prisma.client.faq.update({
      where: { id },
      data: {
        ...(dto.questionEn !== undefined ? { questionEn: dto.questionEn } : {}),
        ...(dto.questionFr !== undefined ? { questionFr: dto.questionFr } : {}),
        ...(dto.answerEn !== undefined ? { answerEn: dto.answerEn } : {}),
        ...(dto.answerFr !== undefined ? { answerFr: dto.answerFr } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
      },
    });

    await this.audit(actor, 'marketing.faq_updated', `Faq:${id}`, { changed: Object.keys(dto) });

    return toFaqView(row);
  }

  async deleteFaq(id: string, actor: AuthenticatedUser): Promise<{ id: string }> {
    await this.requireFaq(id);
    await this.prisma.client.faq.delete({ where: { id } });
    await this.audit(actor, 'marketing.faq_deleted', `Faq:${id}`, {});
    return { id };
  }

  async createTestimonial(
    dto: CreateTestimonialDto,
    actor: AuthenticatedUser,
  ): Promise<TestimonialView> {
    const row = await this.prisma.client.testimonial.create({
      data: {
        author: dto.author,
        roleEn: dto.roleEn,
        roleFr: dto.roleFr,
        avatarUrl: dto.avatarUrl ?? null,
        contentEn: dto.contentEn,
        contentFr: dto.contentFr,
        rating: dto.rating,
        order: dto.order ?? (await this.nextOrder('testimonial')),
        visible: dto.visible ?? true,
      },
    });

    await this.audit(actor, 'marketing.testimonial_created', `Testimonial:${row.id}`, {
      author: row.author,
    });

    return toTestimonialView(row);
  }

  async updateTestimonial(
    id: string,
    dto: UpdateTestimonialDto,
    actor: AuthenticatedUser,
  ): Promise<TestimonialView> {
    await this.requireTestimonial(id);

    const row = await this.prisma.client.testimonial.update({
      where: { id },
      data: {
        ...(dto.author !== undefined ? { author: dto.author } : {}),
        ...(dto.roleEn !== undefined ? { roleEn: dto.roleEn } : {}),
        ...(dto.roleFr !== undefined ? { roleFr: dto.roleFr } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.contentEn !== undefined ? { contentEn: dto.contentEn } : {}),
        ...(dto.contentFr !== undefined ? { contentFr: dto.contentFr } : {}),
        ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.visible !== undefined ? { visible: dto.visible } : {}),
      },
    });

    await this.audit(actor, 'marketing.testimonial_updated', `Testimonial:${id}`, {
      changed: Object.keys(dto),
    });

    return toTestimonialView(row);
  }

  async deleteTestimonial(id: string, actor: AuthenticatedUser): Promise<{ id: string }> {
    await this.requireTestimonial(id);
    await this.prisma.client.testimonial.delete({ where: { id } });
    await this.audit(actor, 'marketing.testimonial_deleted', `Testimonial:${id}`, {});
    return { id };
  }

  /**
   * Applies a whole new ordering in ONE transaction.
   *
   * Atomicity is the point: a drag-reorder saved as N independent updates has
   * intermediate states in which two entries share a position, and a visitor who
   * loads the page during the save sees the list half-sorted.
   */
  async reorderFaqs(dto: ReorderDto, actor: AuthenticatedUser): Promise<FaqView[]> {
    await this.prisma.client.$transaction(
      dto.order.map((entry) =>
        this.prisma.client.faq.update({ where: { id: entry.id }, data: { order: entry.order } }),
      ),
    );

    await this.audit(actor, 'marketing.faqs_reordered', null, { count: dto.order.length });

    return this.listFaqs({ includeUnpublished: true, viewer: actor });
  }

  async reorderTestimonials(dto: ReorderDto, actor: AuthenticatedUser): Promise<TestimonialView[]> {
    await this.prisma.client.$transaction(
      dto.order.map((entry) =>
        this.prisma.client.testimonial.update({
          where: { id: entry.id },
          data: { order: entry.order },
        }),
      ),
    );

    await this.audit(actor, 'marketing.testimonials_reordered', null, { count: dto.order.length });

    return this.listTestimonials({ includeHidden: true, viewer: actor });
  }

  async createPortfolioItem(
    dto: CreatePortfolioItemDto,
    actor: AuthenticatedUser,
  ): Promise<PortfolioItemView> {
    const row = await this.prisma.client.portfolioShowcase.create({
      data: {
        tradeEn: dto.tradeEn,
        tradeFr: dto.tradeFr,
        captionEn: dto.captionEn,
        captionFr: dto.captionFr,
        beforeUrl: dto.beforeUrl,
        afterUrl: dto.afterUrl,
        order: dto.order ?? (await this.nextOrder('portfolio')),
        isPublished: dto.isPublished ?? true,
      },
    });

    await this.audit(actor, 'marketing.portfolio_item_created', `PortfolioShowcase:${row.id}`, {
      tradeEn: row.tradeEn,
    });

    return toPortfolioItemView(row);
  }

  async updatePortfolioItem(
    id: string,
    dto: UpdatePortfolioItemDto,
    actor: AuthenticatedUser,
  ): Promise<PortfolioItemView> {
    await this.requirePortfolioItem(id);

    const row = await this.prisma.client.portfolioShowcase.update({
      where: { id },
      data: {
        ...(dto.tradeEn !== undefined ? { tradeEn: dto.tradeEn } : {}),
        ...(dto.tradeFr !== undefined ? { tradeFr: dto.tradeFr } : {}),
        ...(dto.captionEn !== undefined ? { captionEn: dto.captionEn } : {}),
        ...(dto.captionFr !== undefined ? { captionFr: dto.captionFr } : {}),
        ...(dto.beforeUrl !== undefined ? { beforeUrl: dto.beforeUrl } : {}),
        ...(dto.afterUrl !== undefined ? { afterUrl: dto.afterUrl } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
      },
    });

    await this.audit(actor, 'marketing.portfolio_item_updated', `PortfolioShowcase:${id}`, {
      changed: Object.keys(dto),
    });

    return toPortfolioItemView(row);
  }

  async deletePortfolioItem(id: string, actor: AuthenticatedUser): Promise<{ id: string }> {
    await this.requirePortfolioItem(id);
    await this.prisma.client.portfolioShowcase.delete({ where: { id } });
    await this.audit(actor, 'marketing.portfolio_item_deleted', `PortfolioShowcase:${id}`, {});
    return { id };
  }

  async reorderPortfolio(dto: ReorderDto, actor: AuthenticatedUser): Promise<PortfolioItemView[]> {
    await this.prisma.client.$transaction(
      dto.order.map((entry) =>
        this.prisma.client.portfolioShowcase.update({
          where: { id: entry.id },
          data: { order: entry.order },
        }),
      ),
    );

    await this.audit(actor, 'marketing.portfolio_reordered', null, { count: dto.order.length });

    return this.listPortfolio({ includeUnpublished: true, viewer: actor });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  private async nextOrder(model: 'faq' | 'testimonial' | 'portfolio'): Promise<number> {
    const last =
      model === 'faq'
        ? await this.prisma.client.faq.findFirst({
            orderBy: { order: 'desc' },
            select: { order: true },
          })
        : model === 'testimonial'
          ? await this.prisma.client.testimonial.findFirst({
              orderBy: { order: 'desc' },
              select: { order: true },
            })
          : await this.prisma.client.portfolioShowcase.findFirst({
              orderBy: { order: 'desc' },
              select: { order: true },
            });

    return (last?.order ?? -1) + 1;
  }

  private async requireFaq(id: string): Promise<void> {
    const found = await this.prisma.client.faq.findUnique({ where: { id }, select: { id: true } });
    if (!found) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'FAQ_NOT_FOUND',
        'That FAQ entry no longer exists.',
      );
    }
  }

  private async requireTestimonial(id: string): Promise<void> {
    const found = await this.prisma.client.testimonial.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'TESTIMONIAL_NOT_FOUND',
        'That testimonial no longer exists.',
      );
    }
  }

  private async requirePortfolioItem(id: string): Promise<void> {
    const found = await this.prisma.client.portfolioShowcase.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PORTFOLIO_ITEM_NOT_FOUND',
        'That portfolio entry no longer exists.',
      );
    }
  }

  private async audit(
    actor: AuthenticatedUser,
    action: string,
    target: string | null,
    meta: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        actorId: actor.id,
        action,
        target: target ?? 'Marketing',
        requestId: getRequestId(),
        meta,
      },
    });
  }
}

function toFaqView(row: Faq): FaqView {
  return {
    id: row.id,
    questionEn: row.questionEn,
    questionFr: row.questionFr,
    answerEn: row.answerEn,
    answerFr: row.answerFr,
    category: row.category,
    order: row.order,
    isPublished: row.isPublished,
  };
}

function toTestimonialView(row: Testimonial): TestimonialView {
  // Prisma hands back Decimal, which serialises to a string over GraphQL Float
  // unless it is converted here. Doing it at the boundary means no client ever
  // has to know the column type.
  const rating = Number(row.rating);

  return {
    id: row.id,
    author: row.author,
    roleEn: row.roleEn,
    roleFr: row.roleFr,
    avatarUrl: row.avatarUrl,
    contentEn: row.contentEn,
    contentFr: row.contentFr,
    rating,
    stars: toStarBreakdown(rating),
    order: row.order,
    visible: row.visible,
  };
}

function toPortfolioItemView(row: PortfolioShowcase): PortfolioItemView {
  return {
    id: row.id,
    tradeEn: row.tradeEn,
    tradeFr: row.tradeFr,
    captionEn: row.captionEn,
    captionFr: row.captionFr,
    beforeUrl: row.beforeUrl,
    afterUrl: row.afterUrl,
    order: row.order,
    isPublished: row.isPublished,
  };
}
