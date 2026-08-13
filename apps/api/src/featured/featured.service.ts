import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FeaturedListingStatus, Prisma, Role, VerificationTier } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import {
  FEATURED_APPROVED,
  FEATURED_REJECTED,
  FEATURED_REQUESTED,
  FEATURED_REVOKED,
  FeaturedApprovedEvent,
  FeaturedRejectedEvent,
  FeaturedRequestedEvent,
  FeaturedRevokedEvent,
} from './featured.events';

const logger = createLogger('featured');

/** The lowest and highest an admin may set the extra commission to (0-100%). */
const MIN_EXTRA_COMMISSION_BPS = 0;
const MAX_EXTRA_COMMISSION_BPS = 10_000;

const NON_TERMINAL_STATUSES: readonly FeaturedListingStatus[] = [
  FeaturedListingStatus.PENDING,
  FeaturedListingStatus.APPROVED,
  FeaturedListingStatus.PAUSED,
];

export interface FeaturedListingResult {
  readonly id: string;
  readonly userId: string;
  readonly status: FeaturedListingStatus;
  readonly extraCommissionBps: number | null;
  readonly requestedAt: Date;
  readonly reviewedAt: Date | null;
  readonly reviewedById: string | null;
  readonly rejectionReason: string | null;
  readonly pausedAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface FeaturedQueueItem {
  readonly id: string;
  readonly userId: string;
  readonly name: string | null;
  readonly avatar: string | null;
  readonly activeRole: Role | null;
  readonly tier: VerificationTier;
  readonly trustScore: number;
  readonly completedJobs: number;
  readonly requestedAt: Date;
}

const LISTING_SELECT = {
  id: true,
  userId: true,
  status: true,
  extraCommissionBps: true,
  requestedAt: true,
  reviewedAt: true,
  reviewedById: true,
  rejectionReason: true,
  pausedAt: true,
  revokedAt: true,
} as const;

/**
 * Sponsored ranking placement — request, review and decide (business plan:
 * "Featured/Verified Business tier").
 *
 * A worker/business REQUESTS placement; only an admin decision — approve with a
 * price, or reject — turns it into anything that touches ranking or fees. That
 * split is why `request()` never takes a commission figure and `approve()` is
 * the only place one is ever set.
 */
@Injectable()
export class FeaturedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * A worker/business asks to be featured. Re-opens a REJECTED or REVOKED row
   * back to PENDING rather than creating a second one — one placement per
   * identity, forever, is what keeps "who reviewed this" answerable.
   */
  async request(user: AuthenticatedUser): Promise<FeaturedListingResult> {
    const existing = await this.prisma.client.featuredListing.findUnique({
      where: { userId: user.id },
      select: LISTING_SELECT,
    });

    if (
      existing &&
      (existing.status === FeaturedListingStatus.PENDING ||
        existing.status === FeaturedListingStatus.APPROVED)
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'FEATURED_ALREADY_REQUESTED',
        'You already have a featured placement request on file.',
      );
    }

    const row = existing
      ? await this.prisma.client.featuredListing.update({
          where: { userId: user.id },
          data: {
            status: FeaturedListingStatus.PENDING,
            requestedAt: new Date(),
            reviewedAt: null,
            reviewedById: null,
            rejectionReason: null,
            reviewNote: null,
            pausedAt: null,
            revokedAt: null,
          },
          select: LISTING_SELECT,
        })
      : await this.prisma.client.featuredListing.create({
          data: { userId: user.id, status: FeaturedListingStatus.PENDING },
          select: LISTING_SELECT,
        });

    await this.prisma.client.auditLog.create({
      data: {
        actorId: user.id,
        action: 'featured.requested',
        target: `FeaturedListing:${row.id}`,
        requestId: getRequestId(),
        meta: { userId: user.id },
      },
    });

    this.events.emit(
      FEATURED_REQUESTED,
      new FeaturedRequestedEvent({ userId: user.id, requestId: getRequestId() }),
    );

    logger.info('Featured listing requested', { result: { userId: user.id } });

    return this.toResult(row);
  }

  /**
   * The admin review queue — oldest first, so the FIFO discipline the rest of
   * the review surfaces already use applies here too.
   */
  async listPending(): Promise<FeaturedQueueItem[]> {
    const rows = await this.prisma.client.featuredListing.findMany({
      where: { status: FeaturedListingStatus.PENDING },
      orderBy: { requestedAt: 'asc' },
      select: {
        id: true,
        userId: true,
        requestedAt: true,
        subject: {
          select: {
            name: true,
            avatar: true,
            tier: true,
            trustScore: true,
            roles: { where: { isActive: true }, select: { role: true }, take: 1 },
            trustScoreRecord: { select: { completedJobs: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      name: row.subject.name,
      avatar: row.subject.avatar,
      activeRole: row.subject.roles[0]?.role ?? null,
      tier: row.subject.tier,
      trustScore: row.subject.trustScore,
      completedJobs: row.subject.trustScoreRecord?.completedJobs ?? 0,
      requestedAt: row.requestedAt,
    }));
  }

  /**
   * Approves — or re-approves a PAUSED listing with an updated rate. The
   * commission is the one number a reviewer chooses; everything else here is
   * bookkeeping around that decision.
   */
  async approve(
    userId: string,
    reviewer: AuthenticatedUser,
    extraCommissionBps: number,
    note?: string,
  ): Promise<FeaturedListingResult> {
    if (
      !Number.isInteger(extraCommissionBps) ||
      extraCommissionBps < MIN_EXTRA_COMMISSION_BPS ||
      extraCommissionBps > MAX_EXTRA_COMMISSION_BPS
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_EXTRA_COMMISSION',
        `The extra commission must be a whole number between ${MIN_EXTRA_COMMISSION_BPS} and ${MAX_EXTRA_COMMISSION_BPS} basis points.`,
      );
    }

    const listing = await this.load(userId);

    if (
      listing.status !== FeaturedListingStatus.PENDING &&
      listing.status !== FeaturedListingStatus.PAUSED
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'FEATURED_NOT_DECIDABLE',
        'Only a pending or paused request can be approved.',
      );
    }

    const now = new Date();
    const [row] = await this.prisma.client.$transaction([
      this.prisma.client.featuredListing.update({
        where: { userId },
        data: {
          status: FeaturedListingStatus.APPROVED,
          extraCommissionBps,
          reviewedAt: now,
          reviewedById: reviewer.id,
          reviewNote: note ?? null,
          rejectionReason: null,
          pausedAt: null,
          revokedAt: null,
        },
        select: LISTING_SELECT,
      }),
      this.auditEntry(reviewer.id, 'featured.approved', listing.id, {
        userId,
        extraCommissionBps,
      }),
    ]);

    this.events.emit(
      FEATURED_APPROVED,
      new FeaturedApprovedEvent({
        userId,
        reviewerId: reviewer.id,
        extraCommissionBps,
        requestId: getRequestId(),
      }),
    );

    logger.info('Featured listing approved', {
      result: { userId, extraCommissionBps, reviewerId: reviewer.id },
    });

    return this.toResult(row);
  }

  /** Rejects a PENDING request with a subject-facing reason. */
  async reject(
    userId: string,
    reviewer: AuthenticatedUser,
    reason: string,
    note?: string,
  ): Promise<FeaturedListingResult> {
    const listing = await this.load(userId);

    if (listing.status !== FeaturedListingStatus.PENDING) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'FEATURED_NOT_DECIDABLE',
        'Only a pending request can be rejected.',
      );
    }

    const [row] = await this.prisma.client.$transaction([
      this.prisma.client.featuredListing.update({
        where: { userId },
        data: {
          status: FeaturedListingStatus.REJECTED,
          reviewedAt: new Date(),
          reviewedById: reviewer.id,
          rejectionReason: reason,
          reviewNote: note ?? null,
        },
        select: LISTING_SELECT,
      }),
      this.auditEntry(reviewer.id, 'featured.rejected', listing.id, { userId, reason }),
    ]);

    this.events.emit(
      FEATURED_REJECTED,
      new FeaturedRejectedEvent({
        userId,
        reviewerId: reviewer.id,
        reason,
        requestId: getRequestId(),
      }),
    );

    logger.info('Featured listing rejected', { result: { userId, reviewerId: reviewer.id } });

    return this.toResult(row);
  }

  /** The subject pauses their own placement, or an admin pauses it for them. */
  async pause(userId: string, actor: AuthenticatedUser): Promise<FeaturedListingResult> {
    this.assertSelfOrAdmin(userId, actor);

    const listing = await this.load(userId);

    if (listing.status !== FeaturedListingStatus.APPROVED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'FEATURED_NOT_ACTIVE',
        'Only an active featured placement can be paused.',
      );
    }

    const row = await this.prisma.client.featuredListing.update({
      where: { userId },
      data: { status: FeaturedListingStatus.PAUSED, pausedAt: new Date() },
      select: LISTING_SELECT,
    });

    logger.info('Featured listing paused', { result: { userId, actorId: actor.id } });

    return this.toResult(row);
  }

  /** Resumes a PAUSED placement at its previously approved rate. */
  async resume(userId: string, actor: AuthenticatedUser): Promise<FeaturedListingResult> {
    this.assertSelfOrAdmin(userId, actor);

    const listing = await this.load(userId);

    if (listing.status !== FeaturedListingStatus.PAUSED || listing.extraCommissionBps === null) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'FEATURED_NOT_PAUSED',
        'Only a paused featured placement can be resumed.',
      );
    }

    const row = await this.prisma.client.featuredListing.update({
      where: { userId },
      data: { status: FeaturedListingStatus.APPROVED, pausedAt: null },
      select: LISTING_SELECT,
    });

    logger.info('Featured listing resumed', { result: { userId, actorId: actor.id } });

    return this.toResult(row);
  }

  /** Terminal, admin-only. Ends a placement from any non-terminal status. */
  async revoke(
    userId: string,
    reviewer: AuthenticatedUser,
    note?: string,
  ): Promise<FeaturedListingResult> {
    const listing = await this.load(userId);

    if (!NON_TERMINAL_STATUSES.includes(listing.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'FEATURED_ALREADY_TERMINAL',
        'This featured placement has already been decided.',
      );
    }

    const [row] = await this.prisma.client.$transaction([
      this.prisma.client.featuredListing.update({
        where: { userId },
        data: {
          status: FeaturedListingStatus.REVOKED,
          revokedAt: new Date(),
          reviewedById: reviewer.id,
          reviewedAt: new Date(),
          reviewNote: note ?? null,
        },
        select: LISTING_SELECT,
      }),
      this.auditEntry(reviewer.id, 'featured.revoked', listing.id, { userId }),
    ]);

    this.events.emit(
      FEATURED_REVOKED,
      new FeaturedRevokedEvent({
        userId,
        reviewerId: reviewer.id,
        note: note ?? null,
        requestId: getRequestId(),
      }),
    );

    logger.info('Featured listing revoked', { result: { userId, reviewerId: reviewer.id } });

    return this.toResult(row);
  }

  /** The caller's own placement, or null. Backs the "my status" GraphQL read. */
  async statusFor(userId: string): Promise<FeaturedListingResult | null> {
    const row = await this.prisma.client.featuredListing.findUnique({
      where: { userId },
      select: LISTING_SELECT,
    });

    return row ? this.toResult(row) : null;
  }

  /**
   * The hot-path read for the fee split (§3): 0 for anyone not actively
   * APPROVED, the admin-set rate otherwise. Kept to a single indexed lookup on
   * the unique `userId` column — this runs on every quote accepted.
   */
  async activeExtraCommissionBpsFor(userId: string): Promise<number> {
    const row = await this.prisma.client.featuredListing.findUnique({
      where: { userId },
      select: { status: true, extraCommissionBps: true },
    });

    if (!row || row.status !== FeaturedListingStatus.APPROVED) {
      return 0;
    }

    return row.extraCommissionBps ?? 0;
  }

  /**
   * The same lookup as above, batched — for the quote-preview read (§3), which
   * maps several quotes (and therefore several workers) in one pass and must
   * not turn that into one query per worker.
   */
  async activeExtraCommissionBpsForMany(userIds: string[]): Promise<Map<string, number>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.client.featuredListing.findMany({
      where: { userId: { in: ids }, status: FeaturedListingStatus.APPROVED },
      select: { userId: true, extraCommissionBps: true },
    });

    return new Map(rows.map((row) => [row.userId, row.extraCommissionBps ?? 0]));
  }

  /**
   * Bulk lookup of APPROVED listings for the search ranking hot path (§4). Only
   * carries what `applySponsoredSlots` needs — the rotation cursor.
   */
  async activeListingsFor(userIds: string[]): Promise<Map<string, { lastShownAt: Date | null }>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.client.featuredListing.findMany({
      where: { userId: { in: ids }, status: FeaturedListingStatus.APPROVED },
      select: { userId: true, lastShownAt: true },
    });

    return new Map(rows.map((row) => [row.userId, { lastShownAt: row.lastShownAt }]));
  }

  /**
   * Marks sponsored slots as shown, advancing the fairness rotation cursor.
   * Called fire-and-forget from the search hot path — this must never throw
   * out of that call, so any failure is swallowed and logged.
   */
  async markShown(userIds: string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    try {
      await this.prisma.client.featuredListing.updateMany({
        where: { userId: { in: userIds }, status: FeaturedListingStatus.APPROVED },
        data: { lastShownAt: new Date() },
      });
    } catch (error) {
      logger.warn('Failed to mark sponsored listings as shown', {
        payload: { userIds, error },
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  private async load(userId: string) {
    const listing = await this.prisma.client.featuredListing.findUnique({
      where: { userId },
      select: LISTING_SELECT,
    });

    if (!listing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'FEATURED_NOT_FOUND',
        'We could not find a featured placement request for that account.',
      );
    }

    return listing;
  }

  /** Pause/resume: the subject acting on their own placement, or an admin. */
  private assertSelfOrAdmin(userId: string, actor: AuthenticatedUser): void {
    if (actor.id === userId || actor.activeRole === Role.ADMIN) {
      return;
    }

    throw new AppException(
      HttpStatus.FORBIDDEN,
      'NOT_FEATURED_LISTING_OWNER',
      'Only the account itself or an admin can do that.',
    );
  }

  /** Featured decisions are audit-logged alongside every other money-adjacent event. */
  private auditEntry(
    actorId: string,
    action: string,
    listingId: string,
    meta: Prisma.InputJsonValue,
  ) {
    return this.prisma.client.auditLog.create({
      data: {
        actorId,
        action,
        target: `FeaturedListing:${listingId}`,
        requestId: getRequestId(),
        meta,
      },
    });
  }

  private toResult(row: {
    id: string;
    userId: string;
    status: FeaturedListingStatus;
    extraCommissionBps: number | null;
    requestedAt: Date;
    reviewedAt: Date | null;
    reviewedById: string | null;
    rejectionReason: string | null;
    pausedAt: Date | null;
    revokedAt: Date | null;
  }): FeaturedListingResult {
    return {
      id: row.id,
      userId: row.userId,
      status: row.status,
      extraCommissionBps: row.extraCommissionBps,
      requestedAt: row.requestedAt,
      reviewedAt: row.reviewedAt,
      reviewedById: row.reviewedById,
      rejectionReason: row.rejectionReason,
      pausedAt: row.pausedAt,
      revokedAt: row.revokedAt,
    };
  }
}
