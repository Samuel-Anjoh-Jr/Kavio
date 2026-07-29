import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  MediaAssetKind,
  Prisma,
  ReportTargetType,
  ReviewStatus,
  TrustEventType,
} from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { TrustScoreService } from '../trust/trust-score.service';
import type { CreateReviewDto, HideReviewDto, ReportReviewDto } from './dto/review.dto';
import {
  decideReviewEligibility,
  isExcellentReview,
  REVIEWABLE_BOOKING_STATUSES,
  summariseRatings,
  type ReviewEligibilityDecision,
} from './review.model';
import {
  REVIEW_HIDDEN,
  REVIEW_REPORTED,
  REVIEW_RESTORED,
  REVIEW_SUBMITTED,
  ReviewHiddenEvent,
  ReviewReportedEvent,
  ReviewRestoredEvent,
  ReviewSubmittedEvent,
} from './reviews.events';

const logger = createLogger('reviews');

/**
 * Reviews (PROMPT 79; REV-01, REV-02, REV-03).
 *
 * The Marketplace pillar's main input, which is what makes it worth forging. Two
 * disciplines carry this service:
 *
 *   1. THE SUBJECT IS DERIVED, NEVER SUPPLIED. Who a review is about comes from
 *      the booking on the job — the caller says which job, and the engagement
 *      says who the other party was. That is what "reviews tied to real completed
 *      jobs to prevent fabrication" (REV-02) actually requires; taking a
 *      subjectId from the request body would reduce it to a naming convention.
 *
 *   2. THE SCORE IS NEVER WRITTEN FROM HERE. A qualifying review appends
 *      EXCELLENT_REVIEW to the trust ledger and hiding one appends
 *      EXCELLENT_REVIEW_REVOKED; the number itself is whatever the point model
 *      replays to. This service does write TrustScore.averageRating, because the
 *      reviews module owns that column and the Tier 3 gate reads it — and it
 *      writes it BEFORE recording the event, so the tier derivation inside the
 *      recompute sees the rating this review just changed rather than the one it
 *      replaces.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly trust: TrustScoreService,
  ) {}

  /**
   * Leaves a review on a completed job (REV-01).
   *
   * Both directions run through here: a client rating a worker and a worker
   * rating the client back are the same operation with the parties swapped, so
   * there is one eligibility rule rather than two that can drift apart.
   */
  async create(user: AuthenticatedUser, dto: CreateReviewDto) {
    const decision = await this.eligibility(user.id, dto.jobId);

    if (!decision.eligibility.allowed || !decision.eligibility.subjectId) {
      throw eligibilityRefusal(decision.eligibility);
    }

    await this.assertPhotosOwned(user.id, dto.photoAssetIds);

    const subjectId = decision.eligibility.subjectId;
    const requestId = getRequestId();

    let reviewId: string;
    try {
      reviewId = await this.prisma.client.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            jobId: dto.jobId,
            bookingId: decision.bookingId,
            authorId: user.id,
            subjectId,
            rating: dto.rating,
            text: dto.text ?? null,
          },
          select: { id: true },
        });

        if (dto.photoAssetIds?.length) {
          await tx.reviewPhoto.createMany({
            data: dto.photoAssetIds.map((mediaAssetId, index) => ({
              reviewId: review.id,
              mediaAssetId,
              sortOrder: index,
            })),
            skipDuplicates: true,
          });
        }

        return review.id;
      });
    } catch (error) {
      // @@unique([jobId, authorId]) — a double-tap on a bad connection, or a
      // second attempt after the eligibility read but before this write.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          'ALREADY_REVIEWED',
          'You have already reviewed this job.',
        );
      }
      throw error;
    }

    const excellent = isExcellentReview(dto.rating);
    await this.applyTrust(subjectId, {
      reviewId,
      excellent,
      trustEvent: excellent ? TrustEventType.EXCELLENT_REVIEW : null,
      actorId: user.id,
    });

    this.events.emit(
      REVIEW_SUBMITTED,
      new ReviewSubmittedEvent({
        reviewId,
        jobId: dto.jobId,
        authorId: user.id,
        subjectId,
        rating: dto.rating,
        excellent,
        requestId,
      }),
    );

    logger.info('Review submitted', {
      result: { reviewId, jobId: dto.jobId, subjectId, rating: dto.rating, excellent },
    });

    return { id: reviewId };
  }

  /**
   * Reports a review to the moderation queue (REV-03).
   *
   * The report is an AbuseReport with targetType REVIEW, not a review-specific
   * row: an admin needs every complaint about one item in one place (ADM-08), and
   * a private queue per surface is exactly what makes that impossible.
   */
  async report(user: AuthenticatedUser, reviewId: string, dto: ReportReviewDto) {
    const review = await this.prisma.client.review.findUnique({
      where: { id: reviewId },
      select: { id: true, authorId: true, status: true },
    });
    if (!review) {
      throw notFound();
    }

    if (review.authorId === user.id) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CANNOT_REPORT_OWN_REVIEW',
        'You cannot report your own review.',
      );
    }

    const requestId = getRequestId();
    const report = await this.prisma.client.abuseReport.create({
      data: {
        reporterId: user.id,
        // The author is the identity a moderator would act on — the person who
        // wrote the words, not the person the review is about.
        reportedUserId: review.authorId,
        targetType: ReportTargetType.REVIEW,
        targetId: review.id,
        reason: dto.reason,
        details: dto.details ?? null,
      },
      select: { id: true },
    });

    this.events.emit(
      REVIEW_REPORTED,
      new ReviewReportedEvent({
        reportId: report.id,
        reviewId: review.id,
        targetType: ReportTargetType.REVIEW,
        reporterId: user.id,
        reportedUserId: review.authorId,
        requestId,
      }),
    );

    logger.warn('Review reported', {
      payload: { reportId: report.id, reviewId: review.id, reason: dto.reason },
    });

    return { id: report.id };
  }

  /**
   * Takes a review down (REV-03, admin).
   *
   * HIDDEN, never deleted: the row and its history survive so an admin can say
   * later what came down and why, and so a subject cannot make an inconvenient
   * review vanish. Its trust contribution is withdrawn by appending
   * EXCELLENT_REVIEW_REVOKED — the ledger is append-only, so influence is
   * removed by negation rather than by erasing the grant.
   */
  async hide(admin: AuthenticatedUser, reviewId: string, dto: HideReviewDto) {
    const review = await this.loadForModeration(reviewId);

    if (review.status === ReviewStatus.HIDDEN) {
      return { id: review.id, status: ReviewStatus.HIDDEN };
    }

    const requestId = getRequestId();

    await this.prisma.client.$transaction([
      this.prisma.client.review.update({
        where: { id: review.id },
        data: {
          status: ReviewStatus.HIDDEN,
          hiddenReason: dto.reason,
          moderatedById: admin.id,
          moderatedAt: new Date(),
        },
      }),
      this.auditEntry(admin.id, 'review.hidden', review.id, {
        subjectId: review.subjectId,
        authorId: review.authorId,
        reason: dto.reason,
      }),
    ]);

    await this.applyTrust(review.subjectId, {
      reviewId: review.id,
      excellent: isExcellentReview(review.rating),
      // Only a review that PAID needs its points taking back. Revoking one that
      // never qualified would subtract an occurrence the ledger never granted,
      // and `effectiveOccurrences` would floor it at zero — silently correct
      // today, and a landmine the first time the revocation rule changes.
      trustEvent: isExcellentReview(review.rating) ? TrustEventType.EXCELLENT_REVIEW_REVOKED : null,
      actorId: admin.id,
    });

    this.events.emit(
      REVIEW_HIDDEN,
      new ReviewHiddenEvent({
        reviewId: review.id,
        subjectId: review.subjectId,
        authorId: review.authorId,
        moderatorId: admin.id,
        reason: dto.reason,
        requestId,
      }),
    );

    logger.info('Review hidden by moderation', {
      result: { reviewId: review.id, moderatorId: admin.id },
    });

    return { id: review.id, status: ReviewStatus.HIDDEN };
  }

  /**
   * Reinstates a review moderation had hidden (REV-03, admin).
   *
   * Re-grants the trust event rather than deleting the revocation, for the same
   * reason the revocation was appended in the first place: the history shows
   * that a review was taken down and then put back, which is what happened.
   */
  async restore(admin: AuthenticatedUser, reviewId: string) {
    const review = await this.loadForModeration(reviewId);

    if (review.status === ReviewStatus.PUBLISHED) {
      return { id: review.id, status: ReviewStatus.PUBLISHED };
    }

    const requestId = getRequestId();

    await this.prisma.client.$transaction([
      this.prisma.client.review.update({
        where: { id: review.id },
        data: {
          status: ReviewStatus.PUBLISHED,
          hiddenReason: null,
          moderatedById: admin.id,
          moderatedAt: new Date(),
        },
      }),
      this.auditEntry(admin.id, 'review.restored', review.id, {
        subjectId: review.subjectId,
        authorId: review.authorId,
      }),
    ]);

    await this.applyTrust(review.subjectId, {
      reviewId: review.id,
      excellent: isExcellentReview(review.rating),
      trustEvent: isExcellentReview(review.rating) ? TrustEventType.EXCELLENT_REVIEW : null,
      actorId: admin.id,
    });

    this.events.emit(
      REVIEW_RESTORED,
      new ReviewRestoredEvent({
        reviewId: review.id,
        subjectId: review.subjectId,
        authorId: review.authorId,
        moderatorId: admin.id,
        requestId,
      }),
    );

    return { id: review.id, status: ReviewStatus.PUBLISHED };
  }

  /**
   * Whether the caller may review the job, and about whom (REV-01).
   *
   * Public enough to drive the UI: a client who cannot review needs to be told
   * why — "the job is not finished yet" versus "you already left one" — rather
   * than shown a button that fails.
   */
  async eligibility(
    userId: string,
    jobId: string,
  ): Promise<{ eligibility: ReviewEligibilityDecision; bookingId: string }> {
    const [booking, existing] = await Promise.all([
      // The engagement that could make a review honest: this job's booking, in a
      // finished state, with the caller as one of its two parties. Ordered
      // newest-first so a job that somehow carries more than one booking reviews
      // against the engagement that actually completed.
      this.prisma.client.booking.findFirst({
        where: {
          jobId,
          status: { in: [...REVIEWABLE_BOOKING_STATUSES] },
          OR: [{ clientId: userId }, { workerId: userId }],
        },
        select: { id: true, clientId: true, workerId: true, status: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.review.findUnique({
        where: { jobId_authorId: { jobId, authorId: userId } },
        select: { id: true },
      }),
    ]);

    if (booking) {
      return {
        eligibility: decideReviewEligibility(booking, userId, existing !== null),
        bookingId: booking.id,
      };
    }

    // No finished booking for this caller. Distinguish "not a party" from "not
    // finished yet" so the UI can say something true, without leaking whether a
    // job the caller has nothing to do with exists.
    const anyBooking = await this.prisma.client.booking.findFirst({
      where: { jobId, OR: [{ clientId: userId }, { workerId: userId }] },
      select: { id: true, clientId: true, workerId: true, status: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      eligibility: decideReviewEligibility(anyBooking, userId, existing !== null),
      bookingId: anyBooking?.id ?? '',
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private async loadForModeration(reviewId: string) {
    const review = await this.prisma.client.review.findUnique({
      where: { id: reviewId },
      select: { id: true, authorId: true, subjectId: true, rating: true, status: true },
    });
    if (!review) {
      throw notFound();
    }
    return review;
  }

  /**
   * Refreshes the subject's rating aggregate, then reports the review to the
   * trust ledger.
   *
   * ORDER MATTERS. `averageRating` is written first because the recompute that
   * follows derives the tier, and the Tier 3 gate reads that column (§21.4
   * "≥ 4.8") — recording the event first would derive a tier from the rating
   * this review just replaced. TrustScoreService deliberately never touches
   * `averageRating` on its own upsert, precisely so this ordering holds.
   */
  private async applyTrust(
    subjectId: string,
    options: {
      reviewId: string;
      excellent: boolean;
      trustEvent: TrustEventType | null;
      actorId: string;
    },
  ): Promise<void> {
    await this.refreshRatingAggregate(subjectId);

    if (!options.trustEvent) {
      // Still recompute: the tier gate depends on the rating that just moved,
      // even when the review itself earned no points.
      await this.trust.recompute(subjectId);
      return;
    }

    await this.trust.record({
      subjectId,
      type: options.trustEvent,
      actorId: options.actorId,
      sourceType: 'Review',
      sourceId: options.reviewId,
    });
  }

  /**
   * Recomputes TrustScore.averageRating from the subject's PUBLISHED reviews.
   *
   * Derived from a grouped count rather than kept as a running mean: a running
   * average cannot be corrected when moderation hides a review, and a rating that
   * silently drifts from the reviews on screen is the kind of discrepancy nobody
   * finds until a worker asks why they missed a tier.
   */
  private async refreshRatingAggregate(subjectId: string): Promise<void> {
    const groups = await this.prisma.client.review.groupBy({
      by: ['rating'],
      where: { subjectId, status: ReviewStatus.PUBLISHED },
      _count: { _all: true },
    });

    const summary = summariseRatings(
      new Map(groups.map((group) => [group.rating, group._count._all])),
    );

    await this.prisma.client.trustScore.upsert({
      where: { subjectId },
      create: { subjectId, averageRating: summary.average },
      update: { averageRating: summary.average },
    });
  }

  private async assertPhotosOwned(userId: string, assetIds?: string[]): Promise<void> {
    if (!assetIds || assetIds.length === 0) return;

    const count = await this.prisma.client.mediaAsset.count({
      where: {
        id: { in: assetIds },
        ownerId: userId,
        kind: MediaAssetKind.REVIEW_PHOTO,
        deletedAt: null,
      },
    });

    if (count !== assetIds.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_REVIEW_PHOTO',
        'One or more photos are not review photos you uploaded.',
      );
    }
  }

  /** Moderation decisions are audited alongside money and verification events. */
  private auditEntry(
    actorId: string,
    action: string,
    reviewId: string,
    meta: Prisma.InputJsonValue,
  ) {
    return this.prisma.client.auditLog.create({
      data: {
        actorId,
        action,
        target: `Review:${reviewId}`,
        requestId: getRequestId(),
        meta,
      },
    });
  }
}

/** Turns a refusal reason into the message the author should actually read. */
function eligibilityRefusal(decision: ReviewEligibilityDecision): AppException {
  switch (decision.reason) {
    case 'ALREADY_REVIEWED':
      return new AppException(
        HttpStatus.CONFLICT,
        'ALREADY_REVIEWED',
        'You have already reviewed this job.',
      );
    case 'NOT_COMPLETED':
      return new AppException(
        HttpStatus.CONFLICT,
        'JOB_NOT_COMPLETED',
        'You can leave a review once the work is complete.',
      );
    // "Not a party" and "no booking" are the same answer to the caller: a job
    // they had nothing to do with must not be distinguishable from one that does
    // not exist, or this endpoint becomes a way to enumerate other people's jobs.
    case 'NOT_A_PARTICIPANT':
    case 'NO_BOOKING':
    default:
      return notFound();
  }
}

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'REVIEW_NOT_FOUND', 'We could not find that.');
}
