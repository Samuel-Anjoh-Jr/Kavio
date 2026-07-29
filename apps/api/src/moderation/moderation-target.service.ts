import { Injectable } from '@nestjs/common';
import { JobStatus, ReportTargetType } from '@kavio/database';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';

const logger = createLogger('moderation:targets');

/** A reported item, resolved to who owns it and what an admin needs to see. */
export interface ResolvedTarget {
  /** Whether the item still exists. A deleted item keeps its report group. */
  exists: boolean;
  /** The identity accountable for it — the "concerned party" of any action. */
  ownerId: string | null;
  /** Short human label for the queue row ("Kitchen rewire", "Portfolio photo"). */
  label: string | null;
  /** A longer excerpt where the item has text. */
  excerpt: string | null;
  /** Signed/served image URL where the item is or has one. */
  imageUrl: string | null;
  /** Where an admin goes to see it in context. */
  url: string | null;
}

/**
 * Resolves a (targetType, targetId) pair to its owner, a preview and a link, and
 * takes content down when an admin decides to (ADM-08).
 *
 * This is the one place that knows how each reportable surface is shaped. Keeping
 * it here rather than in the moderation service means adding a new reportable
 * thing is a case in two switches, not a change to the report workflow.
 *
 * Two rules it exists to enforce:
 *
 *   The OWNER IS RESOLVED SERVER-SIDE. A report carries a target, and the party
 *   it lands on is looked up from that target — never taken from the client. A
 *   reporter cannot aim a suspension at someone by editing a request body.
 *
 *   A MISSING TARGET IS NOT AN ERROR. Content gets deleted, often as the outcome
 *   of the very report being read. The group survives with `exists: false` so the
 *   history stays legible and the party can still be actioned.
 */
@Injectable()
export class ModerationTargetService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(targetType: ReportTargetType, targetId: string): Promise<ResolvedTarget> {
    switch (targetType) {
      case ReportTargetType.USER:
        return this.resolveUser(targetId);
      case ReportTargetType.WORKER_PROFILE:
        return this.resolveWorkerProfile(targetId);
      case ReportTargetType.BUSINESS_PROFILE:
        return this.resolveBusinessProfile(targetId);
      case ReportTargetType.JOB:
        return this.resolveJob(targetId);
      case ReportTargetType.PORTFOLIO_ITEM:
        return this.resolvePortfolioItem(targetId);
      case ReportTargetType.MEDIA_ASSET:
        return this.resolveMediaAsset(targetId);
      case ReportTargetType.MESSAGE:
        return this.resolveMessage(targetId);
      case ReportTargetType.CONVERSATION:
        return this.resolveConversation(targetId);
      case ReportTargetType.QUOTE:
        return this.resolveQuote(targetId);
      case ReportTargetType.REVIEW:
        // Reviews are being built in a parallel phase. The type is accepted so a
        // report filed the day reviews ship is not lost, and the party is still
        // actionable through the reporter-supplied identity; the preview and
        // takedown arrive when the module lands.
        return unresolved();
      default:
        return unresolved();
    }
  }

  /**
   * Whether CONTENT_REMOVED means anything for this target type.
   *
   * Exposed so the API can refuse the action with a clear message instead of
   * recording a decision that quietly removes nothing — a moderation queue that
   * lies about what it did is worse than one that admits a gap.
   */
  supportsRemoval(targetType: ReportTargetType): boolean {
    return (
      targetType === ReportTargetType.JOB ||
      targetType === ReportTargetType.PORTFOLIO_ITEM ||
      targetType === ReportTargetType.MEDIA_ASSET ||
      targetType === ReportTargetType.MESSAGE
    );
  }

  /**
   * Takes the item down. Soft everywhere it can be: evidence in an open case
   * must survive the takedown that the case produced.
   */
  async remove(targetType: ReportTargetType, targetId: string): Promise<boolean> {
    switch (targetType) {
      case ReportTargetType.JOB: {
        // Archived, not deleted: quotes, bookings and escrow hang off a job, so
        // removing the row would take a money trail with it.
        const result = await this.prisma.client.job.updateMany({
          where: { id: targetId, status: { not: JobStatus.ARCHIVED } },
          data: { status: JobStatus.ARCHIVED },
        });
        return result.count > 0;
      }
      case ReportTargetType.PORTFOLIO_ITEM: {
        // The item goes; the underlying MediaAsset is soft-deleted separately so
        // a verification pointing at it keeps its evidence.
        const item = await this.prisma.client.portfolioItem.findUnique({
          where: { id: targetId },
          select: { mediaAssetId: true },
        });
        if (!item) return false;

        await this.prisma.client.$transaction([
          this.prisma.client.portfolioItem.delete({ where: { id: targetId } }),
          this.prisma.client.mediaAsset.updateMany({
            where: { id: item.mediaAssetId, deletedAt: null },
            data: { deletedAt: new Date() },
          }),
        ]);
        return true;
      }
      case ReportTargetType.MEDIA_ASSET: {
        const result = await this.prisma.client.mediaAsset.updateMany({
          where: { id: targetId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        return result.count > 0;
      }
      case ReportTargetType.MESSAGE: {
        // Soft delete: the thread keeps a placeholder so the conversation still
        // reads coherently to both parties (MSG-03).
        const result = await this.prisma.client.message.updateMany({
          where: { id: targetId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        return result.count > 0;
      }
      default:
        logger.warn('Removal requested for a target type that does not support it', {
          payload: { targetType, targetId },
        });
        return false;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Per-type resolution
  // ───────────────────────────────────────────────────────────────────────────

  private async resolveUser(id: string): Promise<ResolvedTarget> {
    const user = await this.prisma.client.user.findUnique({
      where: { id },
      select: { id: true, name: true, avatar: true },
    });
    if (!user) return unresolved();

    return {
      exists: true,
      ownerId: user.id,
      label: user.name,
      excerpt: null,
      imageUrl: user.avatar,
      url: `/app/workers/${user.id}`,
    };
  }

  private async resolveWorkerProfile(id: string): Promise<ResolvedTarget> {
    const profile = await this.prisma.client.workerProfile.findUnique({
      where: { id },
      select: { userId: true, headline: true, bio: true, user: { select: { name: true } } },
    });
    if (!profile) return unresolved();

    return {
      exists: true,
      ownerId: profile.userId,
      label: profile.user?.name ?? profile.headline,
      excerpt: profile.bio ?? profile.headline,
      imageUrl: null,
      url: `/app/workers/${profile.userId}`,
    };
  }

  private async resolveBusinessProfile(id: string): Promise<ResolvedTarget> {
    const profile = await this.prisma.client.businessProfile.findUnique({
      where: { id },
      select: { id: true, ownerId: true, name: true, description: true },
    });
    if (!profile) return unresolved();

    return {
      exists: true,
      ownerId: profile.ownerId,
      label: profile.name,
      excerpt: profile.description,
      imageUrl: null,
      url: `/app/businesses/${profile.id}`,
    };
  }

  private async resolveJob(id: string): Promise<ResolvedTarget> {
    const job = await this.prisma.client.job.findUnique({
      where: { id },
      select: { id: true, posterId: true, title: true, description: true, status: true },
    });
    if (!job) return unresolved();

    return {
      exists: job.status !== JobStatus.ARCHIVED,
      ownerId: job.posterId,
      label: job.title,
      excerpt: job.description,
      imageUrl: null,
      url: `/app/jobs/${job.id}`,
    };
  }

  private async resolvePortfolioItem(id: string): Promise<ResolvedTarget> {
    const item = await this.prisma.client.portfolioItem.findUnique({
      where: { id },
      select: {
        caption: true,
        projectTitle: true,
        workerProfile: { select: { userId: true } },
      },
    });
    if (!item) return unresolved();

    return {
      exists: true,
      ownerId: item.workerProfile.userId,
      label: item.projectTitle ?? item.caption,
      excerpt: item.caption,
      // Portfolio media is PUBLIC but still served through the media route, so
      // the admin view resolves it the same way every other surface does.
      imageUrl: null,
      url: `/app/workers/${item.workerProfile.userId}`,
    };
  }

  private async resolveMediaAsset(id: string): Promise<ResolvedTarget> {
    const asset = await this.prisma.client.mediaAsset.findUnique({
      where: { id },
      select: { id: true, ownerId: true, kind: true, deletedAt: true },
    });
    if (!asset) return unresolved();

    return {
      exists: asset.deletedAt === null,
      ownerId: asset.ownerId,
      label: asset.kind,
      excerpt: null,
      imageUrl: null,
      url: null,
    };
  }

  private async resolveMessage(id: string): Promise<ResolvedTarget> {
    const message = await this.prisma.client.message.findUnique({
      where: { id },
      select: {
        id: true,
        senderId: true,
        body: true,
        kind: true,
        deletedAt: true,
        conversationId: true,
      },
    });
    if (!message) return unresolved();

    return {
      exists: message.deletedAt === null,
      ownerId: message.senderId,
      label: message.kind,
      excerpt: message.deletedAt ? null : message.body,
      imageUrl: null,
      url: `/app/messages/${message.conversationId}`,
    };
  }

  private async resolveConversation(id: string): Promise<ResolvedTarget> {
    const conversation = await this.prisma.client.conversation.findUnique({
      where: { id },
      select: { id: true, lastMessagePreview: true, job: { select: { title: true } } },
    });
    if (!conversation) return unresolved();

    return {
      exists: true,
      // A thread has two members and no single owner — the accountable party is
      // whoever the reporter named, which the service validates independently.
      ownerId: null,
      label: conversation.job?.title ?? null,
      excerpt: conversation.lastMessagePreview,
      imageUrl: null,
      url: `/app/messages/${conversation.id}`,
    };
  }

  private async resolveQuote(id: string): Promise<ResolvedTarget> {
    const quote = await this.prisma.client.quote.findUnique({
      where: { id },
      select: { id: true, workerId: true, message: true, job: { select: { title: true } } },
    });
    if (!quote) return unresolved();

    return {
      exists: true,
      ownerId: quote.workerId,
      label: quote.job?.title ?? null,
      excerpt: quote.message,
      imageUrl: null,
      url: `/app/quotes`,
    };
  }
}

function unresolved(): ResolvedTarget {
  return { exists: false, ownerId: null, label: null, excerpt: null, imageUrl: null, url: null };
}
