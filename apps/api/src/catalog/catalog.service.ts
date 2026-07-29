import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma, ServiceCategory } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateServiceCategoryDto,
  ReorderServiceCategoriesDto,
  UpdateServiceCategoryDto,
} from './dto/catalog.dto';
import { slugify, uniqueSlug } from './slug.util';

const logger = createLogger('catalog');

/** The columns every read returns. Explicit, so a schema addition is a decision. */
const CATEGORY_SELECT = {
  id: true,
  slug: true,
  nameEn: true,
  nameFr: true,
  descriptionEn: true,
  descriptionFr: true,
  icon: true,
  parentId: true,
  sortOrder: true,
  isActive: true,
  workerCount: true,
  createdAt: true,
} satisfies Prisma.ServiceCategorySelect;

export type CategoryRow = Prisma.ServiceCategoryGetPayload<{ select: typeof CATEGORY_SELECT }>;

export interface CategoryTreeRow extends CategoryRow {
  children: CategoryRow[];
}

/**
 * The service-category taxonomy (PROMPT 43; ADM-02, DIS-05).
 *
 * This list is what makes search meaningful rather than free-text soup: a worker
 * files their services under it, a client filters by it, and a job post is
 * scoped to it. That also makes it the single highest-leverage thing an admin
 * can break, which is why two rules are enforced here rather than left to
 * discipline:
 *
 *   1. SLUGS ARE IMMUTABLE. They are the key in saved filters and shared links.
 *   2. CATEGORIES ARE RETIRED, NEVER DELETED. A category that has ever scoped a
 *      service or a job must keep resolving or that history becomes unreadable.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Reads (GraphQL)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * A flat list, optionally scoped to one parent.
   *
   * `includeInactive` is an ADMIN-ONLY view of the data and the caller is
   * checked here rather than at the resolver: a retired category must not appear
   * in a guest's browse list, and putting that check next to the query is what
   * stops a future second caller from forgetting it.
   */
  async list(options: {
    parentId?: string | null;
    topLevelOnly?: boolean;
    includeInactive?: boolean;
    viewer?: AuthenticatedUser;
  }): Promise<CategoryRow[]> {
    const includeInactive = this.resolveIncludeInactive(options.includeInactive, options.viewer);

    return this.prisma.client.serviceCategory.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(options.topLevelOnly ? { parentId: null } : {}),
        ...(options.parentId ? { parentId: options.parentId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
      select: CATEGORY_SELECT,
    });
  }

  /**
   * The whole taxonomy as trades with their specialisations.
   *
   * ONE query, assembled in memory. The alternative — fetch parents, then a
   * child query per parent — is the classic N+1 on a list that every discovery
   * surface loads.
   */
  async tree(options: {
    includeInactive?: boolean;
    viewer?: AuthenticatedUser;
  }): Promise<CategoryTreeRow[]> {
    const rows = await this.list({
      includeInactive: options.includeInactive,
      viewer: options.viewer,
    });

    const childrenByParent = new Map<string, CategoryRow[]>();
    for (const row of rows) {
      if (row.parentId) {
        const siblings = childrenByParent.get(row.parentId) ?? [];
        siblings.push(row);
        childrenByParent.set(row.parentId, siblings);
      }
    }

    return rows
      .filter((row) => row.parentId === null)
      .map((row) => ({ ...row, children: childrenByParent.get(row.id) ?? [] }));
  }

  /** One category by id or slug. Slug is the form links and saved filters use. */
  async findOne(
    identifier: { id?: string; slug?: string },
    viewer?: AuthenticatedUser,
  ): Promise<CategoryRow> {
    if (!identifier.id && !identifier.slug) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CATEGORY_IDENTIFIER_REQUIRED',
        'Ask for a category by id or slug.',
      );
    }

    const category = await this.prisma.client.serviceCategory.findFirst({
      where: identifier.id ? { id: identifier.id } : { slug: identifier.slug },
      select: CATEGORY_SELECT,
    });

    if (!category) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'CATEGORY_NOT_FOUND',
        'That service category does not exist.',
      );
    }

    // A retired category still RESOLVES for anyone holding a direct link — that
    // is the whole point of retiring rather than deleting, since old job posts
    // point at it. It simply stops appearing in the browse list above.
    if (!category.isActive && !this.isAdmin(viewer)) {
      logger.info('Retired category resolved for a public caller', {
        payload: { slug: category.slug },
      });
    }

    return category;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Writes (REST, admin only)
  // ───────────────────────────────────────────────────────────────────────────

  async create(dto: CreateServiceCategoryDto, actor: AuthenticatedUser): Promise<CategoryRow> {
    await this.assertValidParent(dto.parentId ?? null, null);

    const base = slugify(dto.nameEn);
    if (!base) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CATEGORY_SLUG_UNDERIVABLE',
        'That name cannot be turned into a web address.',
        { nameEn: ['Use a name containing letters or numbers.'] },
      );
    }

    // Only slugs that could collide are fetched, not the whole table: the
    // taxonomy is small today and this read runs on every create forever.
    const neighbours = await this.prisma.client.serviceCategory.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });

    const slug = uniqueSlug(base, new Set(neighbours.map((row) => row.slug)));

    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(dto.parentId ?? null));

    const category = await this.prisma.client.serviceCategory.create({
      data: {
        slug,
        nameEn: dto.nameEn,
        nameFr: dto.nameFr,
        descriptionEn: dto.descriptionEn ?? null,
        descriptionFr: dto.descriptionFr ?? null,
        icon: dto.icon ?? null,
        parentId: dto.parentId ?? null,
        sortOrder,
      },
      select: CATEGORY_SELECT,
    });

    await this.audit(actor, 'catalog.category_created', category.id, {
      slug: category.slug,
      nameEn: category.nameEn,
      parentId: category.parentId,
    });

    logger.info('Service category created', { payload: { slug, actorId: actor.id } });

    return category;
  }

  async update(
    id: string,
    dto: UpdateServiceCategoryDto,
    actor: AuthenticatedUser,
  ): Promise<CategoryRow> {
    const existing = await this.requireCategory(id);

    if (dto.parentId !== undefined) {
      await this.assertValidParent(dto.parentId, id);
    }

    const category = await this.prisma.client.serviceCategory.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameFr !== undefined ? { nameFr: dto.nameFr } : {}),
        ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
        ...(dto.descriptionFr !== undefined ? { descriptionFr: dto.descriptionFr } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      select: CATEGORY_SELECT,
    });

    await this.audit(actor, 'catalog.category_updated', id, {
      slug: existing.slug,
      changed: Object.keys(dto),
    });

    return category;
  }

  /**
   * Retires a category and everything under it (ADM-02 "retire").
   *
   * The subtree goes with it, because a live specialisation under a retired
   * trade is unreachable by browse and yet still offered by the filter chips —
   * a state that looks like a bug to everyone who meets it.
   *
   * Existing services keep their `categoryId`. They stop being reachable by
   * category browse (search joins on `isActive`) while staying findable by name,
   * and nothing a worker listed silently disappears from their profile.
   */
  async retire(id: string, actor: AuthenticatedUser): Promise<CategoryRow> {
    const existing = await this.requireCategory(id);

    if (!existing.isActive) {
      return existing;
    }

    const [category, children] = await this.prisma.client.$transaction([
      this.prisma.client.serviceCategory.update({
        where: { id },
        data: { isActive: false },
        select: CATEGORY_SELECT,
      }),
      this.prisma.client.serviceCategory.updateMany({
        where: { parentId: id, isActive: true },
        data: { isActive: false },
      }),
    ]);

    await this.audit(actor, 'catalog.category_retired', id, {
      slug: existing.slug,
      retiredChildren: children.count,
    });

    logger.info('Service category retired', {
      payload: { slug: existing.slug, retiredChildren: children.count, actorId: actor.id },
    });

    return category;
  }

  /**
   * Brings a retired category back.
   *
   * Children stay retired: they were retired either on their own merits or as
   * part of this subtree, and we cannot tell which from here. Reviving them all
   * would silently resurrect categories an admin retired deliberately, so the
   * admin restores the ones they want.
   */
  async restore(id: string, actor: AuthenticatedUser): Promise<CategoryRow> {
    const existing = await this.requireCategory(id);

    if (existing.parentId) {
      const parent = await this.prisma.client.serviceCategory.findUnique({
        where: { id: existing.parentId },
        select: { isActive: true, nameEn: true },
      });

      if (parent && !parent.isActive) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'CATEGORY_PARENT_RETIRED',
          `Restore "${parent.nameEn}" first — a live specialisation under a retired trade is unreachable.`,
          { parentId: ['This category’s parent is retired.'] },
        );
      }
    }

    const category = await this.prisma.client.serviceCategory.update({
      where: { id },
      data: { isActive: true },
      select: CATEGORY_SELECT,
    });

    await this.audit(actor, 'catalog.category_restored', id, { slug: existing.slug });

    return category;
  }

  /** Bulk reorder, so the browse list can be dragged into shape in one save. */
  async reorder(dto: ReorderServiceCategoriesDto, actor: AuthenticatedUser): Promise<number> {
    await this.prisma.client.$transaction(
      dto.order.map((entry) =>
        this.prisma.client.serviceCategory.update({
          where: { id: entry.id },
          data: { sortOrder: entry.sortOrder },
        }),
      ),
    );

    await this.audit(actor, 'catalog.categories_reordered', null, { count: dto.order.length });

    return dto.order.length;
  }

  /**
   * Recomputes `workerCount` across the taxonomy from live listings.
   *
   * DERIVED in full rather than incremented on each listing change, and that is
   * the deliberate call: an incremental counter drifts the first time a
   * transaction fails halfway, and this number is not decoration — it drives the
   * trending-categories surface (DIS-03) and the no-provider copy (DIS-06), both
   * of which are wrong in a way users notice.
   *
   * One statement, so the whole taxonomy moves to a consistent count together.
   */
  async recountWorkers(actor?: AuthenticatedUser): Promise<number> {
    const started = Date.now();

    const updated = await this.prisma.client.$executeRaw`
      UPDATE "ServiceCategory" c
      SET "workerCount" = COALESCE(counts.total, 0)
      FROM (
        SELECT
          cat."id" AS category_id,
          COUNT(DISTINCT s."workerProfileId") AS total
        FROM "ServiceCategory" cat
        LEFT JOIN "Service" s
          ON s."categoryId" = cat."id"
         AND s."isActive"
         -- Eligibility is delegated to the search view rather than restated as
         -- another set of joins on User/TrustScore. If the two ever disagreed,
         -- a category would advertise providers that search cannot return —
         -- which is the exact false promise DIS-06 exists to prevent.
         AND s."workerProfileId" IN (SELECT worker_profile_id FROM search.searchable_worker)
        GROUP BY cat."id"
      ) AS counts
      WHERE c."id" = counts.category_id
        AND c."workerCount" IS DISTINCT FROM COALESCE(counts.total, 0)
    `;

    logger.info('Taxonomy worker counts recomputed', {
      durationMs: Date.now() - started,
      payload: { changed: updated },
    });

    if (actor) {
      await this.audit(actor, 'catalog.worker_counts_recomputed', null, { changed: updated });
    }

    return updated;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  private async requireCategory(id: string): Promise<CategoryRow> {
    const category = await this.prisma.client.serviceCategory.findUnique({
      where: { id },
      select: CATEGORY_SELECT,
    });

    if (!category) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'CATEGORY_NOT_FOUND',
        'That service category does not exist.',
      );
    }

    return category;
  }

  /**
   * Keeps the taxonomy exactly two levels deep and acyclic.
   *
   * Three distinct failures, three distinct messages — an admin who has just
   * been told "invalid parent" has no idea which of these they hit.
   */
  private async assertValidParent(parentId: string | null, selfId: string | null): Promise<void> {
    if (parentId === null) {
      return;
    }

    if (parentId === selfId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CATEGORY_SELF_PARENT',
        'A category cannot be its own parent.',
        { parentId: ['Choose a different parent.'] },
      );
    }

    const parent = await this.prisma.client.serviceCategory.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true, isActive: true, nameEn: true },
    });

    if (!parent) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CATEGORY_PARENT_NOT_FOUND',
        'That parent category does not exist.',
        { parentId: ['Choose an existing category.'] },
      );
    }

    if (parent.parentId !== null) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CATEGORY_DEPTH_EXCEEDED',
        `"${parent.nameEn}" is already a specialisation. The taxonomy is two levels deep.`,
        { parentId: ['Choose a top-level trade instead.'] },
      );
    }

    if (!parent.isActive) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CATEGORY_PARENT_RETIRED',
        `"${parent.nameEn}" is retired, so nothing new can be filed under it.`,
        { parentId: ['Choose a live category.'] },
      );
    }

    // Moving a trade that already HAS specialisations under another trade would
    // create a third level by the back door.
    if (selfId) {
      const childCount = await this.prisma.client.serviceCategory.count({
        where: { parentId: selfId },
      });

      if (childCount > 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'CATEGORY_HAS_CHILDREN',
          'This category has specialisations of its own, so it cannot become one.',
          { parentId: [`Move its ${childCount} specialisation(s) first.`] },
        );
      }
    }
  }

  private async nextSortOrder(parentId: string | null): Promise<number> {
    const last = await this.prisma.client.serviceCategory.findFirst({
      where: { parentId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    return (last?.sortOrder ?? -1) + 1;
  }

  private isAdmin(viewer?: AuthenticatedUser): boolean {
    return viewer?.activeRole === 'ADMIN';
  }

  private resolveIncludeInactive(requested: boolean | undefined, viewer?: AuthenticatedUser) {
    if (!requested) {
      return false;
    }

    if (!this.isAdmin(viewer)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Only admins can list retired categories.',
      );
    }

    return true;
  }

  /**
   * Every taxonomy write is audit-logged. The guard decides who gets in; the
   * audit log answers for what they did once they were in (SRS §24).
   */
  private async audit(
    actor: AuthenticatedUser,
    action: string,
    targetId: string | null,
    meta: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        actorId: actor.id,
        action,
        target: targetId ? `ServiceCategory:${targetId}` : 'ServiceCategory',
        requestId: getRequestId(),
        meta,
      },
    });
  }
}

/** Shared by callers that need a category row shaped for GraphQL. */
export function toCategoryView(row: CategoryRow | ServiceCategory) {
  return {
    id: row.id,
    slug: row.slug,
    nameEn: row.nameEn,
    nameFr: row.nameFr,
    descriptionEn: row.descriptionEn,
    descriptionFr: row.descriptionFr,
    icon: row.icon,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    workerCount: row.workerCount,
    createdAt: row.createdAt,
  };
}
