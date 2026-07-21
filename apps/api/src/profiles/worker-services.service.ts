import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CatalogService } from '../catalog/catalog.service';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateServiceDto, UpdateServiceDto } from './dto/profile-management.dto';
import { ProfileOwnershipService } from './profile-ownership.service';

const logger = createLogger('profiles.services');

/** A ceiling on one worker's listings — beyond this it is spam, not a trade. */
const MAX_SERVICES_PER_WORKER = 40;

export interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  startingPrice: number | null;
  categoryId: string | null;
  isActive: boolean;
}

const SERVICE_SELECT = {
  id: true,
  name: true,
  description: true,
  startingPrice: true,
  categoryId: true,
  isActive: true,
} as const;

/**
 * A worker's service list (PROMPT 48; PRO-05).
 *
 * Transparent pricing is the point: a client should see what a job starts at
 * before they make contact, because "call for a price" is how the informal
 * market prices strangers differently from neighbours. That is also why
 * `startingPrice` is nullable rather than required — forcing a number on
 * genuinely variable work produces fictional prices, which is worse than an
 * honest "ask me".
 */
@Injectable()
export class WorkerServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: ProfileOwnershipService,
    private readonly catalog: CatalogService,
  ) {}

  async list(user: AuthenticatedUser): Promise<ServiceRow[]> {
    const profile = await this.ownership.requireWorkerProfile(user.id);

    return this.prisma.client.service.findMany({
      where: { workerProfileId: profile.id },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: SERVICE_SELECT,
    });
  }

  async create(user: AuthenticatedUser, dto: CreateServiceDto): Promise<ServiceRow> {
    const profile = await this.ownership.requireWorkerProfile(user.id);

    const existing = await this.prisma.client.service.count({
      where: { workerProfileId: profile.id },
    });

    if (existing >= MAX_SERVICES_PER_WORKER) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'SERVICE_LIMIT_REACHED',
        `You can list up to ${MAX_SERVICES_PER_WORKER} services. Remove one to add another.`,
      );
    }

    await this.assertCategoryUsable(dto.categoryId);

    const service = await this.prisma.client.service.create({
      data: {
        workerProfileId: profile.id,
        name: dto.name,
        description: dto.description ?? null,
        startingPrice: dto.startingPrice ?? null,
        categoryId: dto.categoryId ?? null,
        isActive: dto.isActive ?? true,
      },
      select: SERVICE_SELECT,
    });

    await this.refreshCategoryCount(dto.categoryId);

    logger.info('Service created', {
      payload: { workerProfileId: profile.id, categoryId: dto.categoryId ?? null },
    });

    return service;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateServiceDto): Promise<ServiceRow> {
    const profile = await this.ownership.requireWorkerProfile(user.id);
    const existing = await this.requireOwnServiceRow(profile.id, id);

    if (dto.categoryId !== undefined) {
      await this.assertCategoryUsable(dto.categoryId);
    }

    const service = await this.prisma.client.service.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.startingPrice !== undefined ? { startingPrice: dto.startingPrice } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: SERVICE_SELECT,
    });

    // Both categories move: the one it left and the one it joined.
    await this.refreshCategoryCount(existing.categoryId);
    if (service.categoryId !== existing.categoryId) {
      await this.refreshCategoryCount(service.categoryId);
    }

    return service;
  }

  /**
   * Removes a listing.
   *
   * A real delete, unlike a retired CATEGORY: a service is the worker's own
   * content, nothing historical points at it yet, and a worker who removes a
   * listing means it — leaving a tombstone they can still see would read as the
   * delete having failed. Deactivating (`isActive: false`) stays available for
   * "not right now".
   */
  async remove(user: AuthenticatedUser, id: string): Promise<{ id: string }> {
    const profile = await this.ownership.requireWorkerProfile(user.id);
    const existing = await this.requireOwnServiceRow(profile.id, id);

    await this.prisma.client.service.delete({ where: { id } });
    await this.refreshCategoryCount(existing.categoryId);

    logger.info('Service removed', { payload: { workerProfileId: profile.id } });

    return { id };
  }

  private async requireOwnServiceRow(
    workerProfileId: string,
    id: string,
  ): Promise<{ id: string; categoryId: string | null }> {
    // Scoped by workerProfileId in the WHERE rather than fetched and compared:
    // another worker's service id is simply not found, so the endpoint cannot be
    // used to confirm that an id exists.
    const service = await this.prisma.client.service.findFirst({
      where: { id, workerProfileId },
      select: { id: true, categoryId: true },
    });

    if (!service) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'SERVICE_NOT_FOUND',
        'That service is not on your profile.',
      );
    }

    return service;
  }

  /**
   * A worker may only file under a LIVE category.
   *
   * Retired categories still resolve for historic data, but letting a new
   * listing join one would put the service somewhere no client can browse to —
   * the worker would have filed their trade into a drawer that is nailed shut.
   */
  private async assertCategoryUsable(categoryId: string | null | undefined): Promise<void> {
    if (!categoryId) {
      return;
    }

    const category = await this.prisma.client.serviceCategory.findUnique({
      where: { id: categoryId },
      select: { isActive: true },
    });

    if (!category) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CATEGORY_NOT_FOUND',
        'That service category does not exist.',
        { categoryId: ['Choose a category from the list.'] },
      );
    }

    if (!category.isActive) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CATEGORY_RETIRED',
        'That category is no longer offered.',
        { categoryId: ['Choose a different category.'] },
      );
    }
  }

  /**
   * Keeps the taxonomy's `workerCount` honest after a listing changes.
   *
   * Full re-derivation rather than an increment, for the reason spelled out on
   * CatalogService.recountWorkers: an incremental counter drifts the first time
   * a transaction fails halfway, and this number drives the trending-categories
   * surface and the no-provider copy. It is cheap — one indexed UPDATE — and a
   * failure here must never fail the worker's save, so it is logged rather than
   * thrown.
   */
  private async refreshCategoryCount(categoryId: string | null | undefined): Promise<void> {
    if (!categoryId) {
      return;
    }

    try {
      await this.catalog.recountWorkers();
    } catch (error) {
      logger.error('Failed to refresh taxonomy worker counts', {
        payload: { categoryId },
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
