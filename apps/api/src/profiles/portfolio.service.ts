import { HttpStatus, Injectable } from '@nestjs/common';
import { MediaAssetKind, PortfolioItemType, PortfolioSlot, TrustEventType } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TrustScoreService } from '../trust/trust-score.service';
import type {
  AddPortfolioItemDto,
  ReorderPortfolioDto,
  UpdatePortfolioItemDto,
} from './dto/profile-management.dto';
import { resolveProjectTitle } from './portfolio-grouping';
import { ProfileOwnershipService } from './profile-ownership.service';

const logger = createLogger('profiles.portfolio');

/** A ceiling per worker. Beyond this the gallery is unusable, not impressive. */
const MAX_PORTFOLIO_ITEMS = 100;

/** The only media kinds that may appear in a public gallery. */
const PORTFOLIO_MEDIA_KINDS = [MediaAssetKind.PORTFOLIO_IMAGE] as const;

export interface PortfolioItemRow {
  id: string;
  type: PortfolioItemType;
  caption: string | null;
  groupKey: string | null;
  projectTitle: string | null;
  slot: PortfolioSlot | null;
  sortOrder: number;
  url: string | null;
}

/**
 * Portfolio management (PROMPT 48; PRO-02, PRO-07).
 *
 * Portfolio is the top survey-validated driver of who gets hired — it is
 * evidence, not decoration — which is why adding the first item is a scored
 * trust event and why the grouping rules below are enforced rather than left to
 * the client.
 */
@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: ProfileOwnershipService,
    private readonly storage: StorageService,
    private readonly trust: TrustScoreService,
  ) {}

  async list(user: AuthenticatedUser): Promise<PortfolioItemRow[]> {
    const profile = await this.ownership.requireWorkerProfile(user.id);

    const items = await this.prisma.client.portfolioItem.findMany({
      where: { workerProfileId: profile.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        type: true,
        caption: true,
        groupKey: true,
        projectTitle: true,
        slot: true,
        sortOrder: true,
        mediaAsset: { select: { s3Key: true, visibility: true } },
      },
    });

    return Promise.all(
      items.map(async (item) => ({
        id: item.id,
        type: item.type,
        caption: item.caption,
        groupKey: item.groupKey,
        projectTitle: item.projectTitle,
        slot: item.slot,
        sortOrder: item.sortOrder,
        url: await this.storage.urlFor(item.mediaAsset.s3Key, item.mediaAsset.visibility),
      })),
    );
  }

  async add(user: AuthenticatedUser, dto: AddPortfolioItemDto): Promise<PortfolioItemRow> {
    const profile = await this.ownership.requireWorkerProfile(user.id);

    // Ownership AND kind. Without the kind check a worker could attach their own
    // national ID as a portfolio photo and publish it to the world.
    await this.ownership.requireOwnedMedia(user.id, dto.mediaAssetId, PORTFOLIO_MEDIA_KINDS);

    const existingCount = await this.prisma.client.portfolioItem.count({
      where: { workerProfileId: profile.id },
    });

    if (existingCount >= MAX_PORTFOLIO_ITEMS) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PORTFOLIO_LIMIT_REACHED',
        `Your portfolio holds the maximum of ${MAX_PORTFOLIO_ITEMS} items. Remove one to add another.`,
      );
    }

    const duplicate = await this.prisma.client.portfolioItem.findFirst({
      where: { workerProfileId: profile.id, mediaAssetId: dto.mediaAssetId },
      select: { id: true },
    });

    if (duplicate) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PORTFOLIO_DUPLICATE',
        'That photo is already in your portfolio.',
        { mediaAssetId: ['Choose a different photo.'] },
      );
    }

    if (dto.slot && !dto.groupKey) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'PORTFOLIO_SLOT_WITHOUT_GROUP',
        'A before/after photo has to belong to a project.',
        { groupKey: ['Group this photo with its pair.'] },
      );
    }

    if (dto.groupKey && dto.slot) {
      await this.assertSlotFree(profile.id, dto.groupKey, dto.slot);
    }

    const groupKey = dto.groupKey ?? null;

    // Resolved BEFORE the write, so a photo joining an existing project adopts
    // that project's name instead of landing with a null title beside siblings
    // that have one.
    const title = resolveProjectTitle({
      groupKey,
      requestedTitle: dto.projectTitle,
      existingGroupTitle: await this.groupTitle(profile.id, groupKey),
    });

    const item = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.portfolioItem.create({
        data: {
          workerProfileId: profile.id,
          mediaAssetId: dto.mediaAssetId,
          type: dto.type ?? PortfolioItemType.PHOTO,
          caption: dto.caption ?? null,
          groupKey,
          projectTitle: title.title,
          slot: dto.slot ?? null,
          sortOrder: dto.sortOrder ?? existingCount,
        },
        select: {
          id: true,
          type: true,
          caption: true,
          groupKey: true,
          projectTitle: true,
          slot: true,
          sortOrder: true,
          mediaAsset: { select: { s3Key: true, visibility: true } },
        },
      });

      // An EXPLICIT title renames the whole project, in the same transaction —
      // the group either has the new name everywhere or nowhere.
      if (groupKey && title.rewriteGroup) {
        await tx.portfolioItem.updateMany({
          where: { workerProfileId: profile.id, groupKey },
          data: { projectTitle: title.title },
        });
      }

      return created;
    });

    // The first item is the one that earns trust (PORTFOLIO_ADDED). The point
    // model treats the rule as ONCE, so a replay is harmless — but not
    // re-recording on every upload keeps the ledger readable.
    if (existingCount === 0) {
      await this.trust.record({
        subjectId: user.id,
        type: TrustEventType.PORTFOLIO_ADDED,
        sourceType: 'PortfolioItem',
        sourceId: item.id,
      });
    }

    logger.info('Portfolio item added', {
      payload: { workerProfileId: profile.id, grouped: Boolean(dto.groupKey) },
    });

    return {
      id: item.id,
      type: item.type,
      caption: item.caption,
      groupKey: item.groupKey,
      projectTitle: item.projectTitle,
      slot: item.slot,
      sortOrder: item.sortOrder,
      url: await this.storage.urlFor(item.mediaAsset.s3Key, item.mediaAsset.visibility),
    };
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdatePortfolioItemDto,
  ): Promise<PortfolioItemRow> {
    const profile = await this.ownership.requireWorkerProfile(user.id);
    const existing = await this.requireOwnItem(profile.id, id);

    const groupKey = dto.groupKey !== undefined ? dto.groupKey : existing.groupKey;
    const slot = dto.slot !== undefined ? dto.slot : existing.slot;

    if (slot && !groupKey) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'PORTFOLIO_SLOT_WITHOUT_GROUP',
        'A before/after photo has to belong to a project.',
        { groupKey: ['Group this photo with its pair.'] },
      );
    }

    if (groupKey && slot) {
      await this.assertSlotFree(profile.id, groupKey, slot, id);
    }

    // Resolved against the group the item is moving INTO, not the one it is
    // leaving — otherwise a photo dragged from "Kitchen refit" into "Bathroom"
    // carries the kitchen's name across with it.
    const title = resolveProjectTitle({
      groupKey,
      requestedTitle: dto.projectTitle,
      existingGroupTitle:
        groupKey === existing.groupKey
          ? existing.projectTitle
          : await this.groupTitle(profile.id, groupKey),
    });

    const item = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.portfolioItem.update({
        where: { id },
        data: {
          ...(dto.caption !== undefined ? { caption: dto.caption } : {}),
          ...(dto.groupKey !== undefined ? { groupKey: dto.groupKey } : {}),
          projectTitle: title.title,
          ...(dto.slot !== undefined ? { slot: dto.slot } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
        select: {
          id: true,
          type: true,
          caption: true,
          groupKey: true,
          projectTitle: true,
          slot: true,
          sortOrder: true,
          mediaAsset: { select: { s3Key: true, visibility: true } },
        },
      });

      if (groupKey && title.rewriteGroup) {
        await tx.portfolioItem.updateMany({
          where: { workerProfileId: profile.id, groupKey },
          data: { projectTitle: title.title },
        });
      }

      return updated;
    });

    return {
      id: item.id,
      type: item.type,
      caption: item.caption,
      groupKey: item.groupKey,
      projectTitle: item.projectTitle,
      slot: item.slot,
      sortOrder: item.sortOrder,
      url: await this.storage.urlFor(item.mediaAsset.s3Key, item.mediaAsset.visibility),
    };
  }

  /**
   * Removes an item from the gallery.
   *
   * The MediaAsset itself is left alone. Deleting the bytes here would break the
   * one case that matters: the same photo submitted as evidence for a
   * verification check, where the file has to survive for the audit trail even
   * after the worker tidies up their gallery.
   *
   * The PORTFOLIO_ADDED trust event is not reversed either. It records that the
   * worker DID build a portfolio, which remains true; the ledger is append-only
   * and a compensating event would claim something that did not happen.
   */
  async remove(user: AuthenticatedUser, id: string): Promise<{ id: string }> {
    const profile = await this.ownership.requireWorkerProfile(user.id);
    await this.requireOwnItem(profile.id, id);

    await this.prisma.client.portfolioItem.delete({ where: { id } });

    logger.info('Portfolio item removed', { payload: { workerProfileId: profile.id } });

    return { id };
  }

  /** Bulk reorder, so a drag-and-drop gallery saves once instead of per item. */
  async reorder(user: AuthenticatedUser, dto: ReorderPortfolioDto): Promise<number> {
    const profile = await this.ownership.requireWorkerProfile(user.id);

    const owned = await this.prisma.client.portfolioItem.findMany({
      where: { workerProfileId: profile.id, id: { in: dto.order.map((entry) => entry.id) } },
      select: { id: true },
    });

    if (owned.length !== dto.order.length) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PORTFOLIO_ITEM_NOT_FOUND',
        'Some of those items are not in your portfolio.',
      );
    }

    await this.prisma.client.$transaction(
      dto.order.map((entry) =>
        this.prisma.client.portfolioItem.update({
          where: { id: entry.id },
          data: { sortOrder: entry.sortOrder },
        }),
      ),
    );

    return dto.order.length;
  }

  /**
   * The title a group already carries.
   *
   * Any member answers for the whole group — that is the invariant
   * {@link resolveProjectTitle} exists to hold — so the first row is enough and
   * there is no need to read the group to check they agree.
   */
  private async groupTitle(
    workerProfileId: string,
    groupKey: string | null,
  ): Promise<string | null> {
    if (!groupKey) {
      return null;
    }

    const sibling = await this.prisma.client.portfolioItem.findFirst({
      where: { workerProfileId, groupKey, projectTitle: { not: null } },
      select: { projectTitle: true },
    });

    return sibling?.projectTitle ?? null;
  }

  private async requireOwnItem(
    workerProfileId: string,
    id: string,
  ): Promise<{
    id: string;
    groupKey: string | null;
    slot: PortfolioSlot | null;
    projectTitle: string | null;
  }> {
    const item = await this.prisma.client.portfolioItem.findFirst({
      where: { id, workerProfileId },
      select: { id: true, groupKey: true, slot: true, projectTitle: true },
    });

    if (!item) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PORTFOLIO_ITEM_NOT_FOUND',
        'That item is not in your portfolio.',
      );
    }

    return item;
  }

  /**
   * One BEFORE and one AFTER per group.
   *
   * A group holding two "before" photos cannot render a comparison, and the UI
   * would have to pick one arbitrarily — so the conflict is refused at the point
   * the worker creates it, while they still remember which photo is which.
   */
  private async assertSlotFree(
    workerProfileId: string,
    groupKey: string,
    slot: PortfolioSlot,
    excludeId?: string,
  ): Promise<void> {
    const taken = await this.prisma.client.portfolioItem.findFirst({
      where: {
        workerProfileId,
        groupKey,
        slot,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (taken) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PORTFOLIO_SLOT_TAKEN',
        `This project already has an "${slot.toLowerCase()}" photo.`,
        { slot: ['Replace the existing one, or start a new project.'] },
      );
    }
  }
}
