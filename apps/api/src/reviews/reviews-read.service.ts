import { Injectable } from '@nestjs/common';
import { ReviewStatus } from '@kavio/database';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { summariseRatings, type ReviewSummary } from './review.model';
import type { ReviewListItemView, ReviewSummaryView } from './models/review.model';

const logger = createLogger('reviews:read');

/** Page size ceiling. A popular worker's Reviews tab must stay one bounded scan. */
const MAX_PAGE = 50;

/**
 * Review reads (REV-02), GraphQL per the DUAL API RULE.
 *
 * These are PUBLIC. The guest first-interface lets an unauthenticated visitor
 * open a full worker profile (ACC-01), and a profile whose reviews are hidden
 * behind a login is not the profile the platform is trying to show off — reviews
 * are the evidence the whole trust proposition rests on.
 *
 * Hidden reviews are excluded everywhere, including from the average, so what a
 * visitor counts on screen always reconciles with the number above it.
 */
@Injectable()
export class ReviewsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Average, distribution bars and count for a profile header (REV-02). */
  async summary(subjectId: string): Promise<ReviewSummaryView> {
    const started = Date.now();

    // One grouped query, not one count per star: five round-trips to paint five
    // bars is the N+1 the standards forbid, wearing a hat.
    const groups = await this.prisma.client.review.groupBy({
      by: ['rating'],
      where: { subjectId, status: ReviewStatus.PUBLISHED },
      _count: { _all: true },
    });

    const summary: ReviewSummary = summariseRatings(
      new Map(groups.map((group) => [group.rating, group._count._all])),
    );

    const durationMs = Date.now() - started;
    if (durationMs > 300) {
      logger.warn('Review summary exceeded the slow-query budget', {
        result: { subjectId },
        durationMs,
      });
    }

    return {
      subjectId,
      total: summary.total,
      average: summary.average,
      distribution: summary.distribution.map((bucket) => ({ ...bucket })),
    };
  }

  /** One subject's visible reviews, newest first (REV-02). */
  async list(
    subjectId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<ReviewListItemView[]> {
    const take = Math.min(options.limit ?? 20, MAX_PAGE);

    const rows = await this.prisma.client.review.findMany({
      where: { subjectId, status: ReviewStatus.PUBLISHED },
      orderBy: { createdAt: 'desc' },
      take,
      skip: options.offset ?? 0,
      select: {
        id: true,
        rating: true,
        text: true,
        createdAt: true,
        jobId: true,
        authorId: true,
        // Selected, never included wholesale: a reviews list needs the author's
        // display name, not their phone number and every relation they own.
        author: { select: { name: true } },
        job: { select: { title: true } },
        photos: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, mediaAsset: { select: { s3Key: true, visibility: true } } },
        },
      },
    });

    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        rating: row.rating,
        text: row.text,
        authorId: row.authorId,
        authorName: row.author.name,
        jobId: row.jobId,
        jobTitle: row.job.title,
        createdAt: row.createdAt,
        photoUrls: (
          await Promise.all(
            row.photos.map((photo) =>
              this.storage.urlFor(photo.mediaAsset.s3Key, photo.mediaAsset.visibility),
            ),
          )
        ).filter((url): url is string => url !== null),
      })),
    );
  }
}
