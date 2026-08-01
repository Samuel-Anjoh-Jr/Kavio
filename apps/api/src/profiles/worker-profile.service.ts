import { HttpStatus, Injectable } from '@nestjs/common';
import {
  EndorsementStatus,
  JobInvitationStatus,
  MediaVisibility,
  PortfolioItemType,
  PortfolioSlot,
  VerificationStatus,
  type Prisma,
} from '@kavio/database';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { groupByDay } from './availability.util';
import type { PortfolioGroupView, WorkerProfileView } from './models/worker-profile.model';
import { computeResponseTimeStat } from './response-time.util';

const logger = createLogger('profiles.worker');

const SLOW_QUERY_MS = 300;

/** One portfolio row as selected below, before its media URL is resolved. */
interface PortfolioRow {
  id: string;
  type: PortfolioItemType;
  caption: string | null;
  groupKey: string | null;
  projectTitle: string | null;
  slot: PortfolioSlot | null;
  sortOrder: number;
  createdAt: Date;
  mediaAsset: { s3Key: string; visibility: MediaVisibility };
}

/**
 * Everything the profile screen needs, in ONE query.
 *
 * Written as an explicit select rather than an include so that adding a column
 * to WorkerProfile does not silently widen this payload — the profile is the
 * heaviest public read in the app and it is served over 3G.
 *
 * Every nested relation is bounded (`take`) or filtered to what is displayable.
 * An unbounded `portfolio: true` on a prolific worker is a megabyte of JSON that
 * nobody scrolls to the end of.
 */
const WORKER_PROFILE_SELECT = {
  id: true,
  userId: true,
  headline: true,
  bio: true,
  yearsExperience: true,
  city: true,
  area: true,
  landmark: true,
  createdAt: true,
  cover: { select: { s3Key: true, visibility: true } },
  user: {
    select: {
      name: true,
      avatar: true,
      tier: true,
      trustScore: true,
      createdAt: true,
      trustScoreRecord: {
        select: {
          total: true,
          identityScore: true,
          professionalScore: true,
          marketplaceScore: true,
          financialScore: true,
          completedJobs: true,
          averageRating: true,
          suspended: true,
        },
      },
    },
  },
  services: {
    where: { isActive: true },
    orderBy: [{ startingPrice: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      startingPrice: true,
      categoryId: true,
      category: { select: { slug: true, nameEn: true, nameFr: true, isActive: true } },
    },
  },
  portfolio: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    take: 60,
    select: {
      id: true,
      type: true,
      caption: true,
      groupKey: true,
      projectTitle: true,
      slot: true,
      sortOrder: true,
      createdAt: true,
      mediaAsset: { select: { s3Key: true, visibility: true } },
    },
  },
  availability: {
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    select: { dayOfWeek: true, startTime: true, endTime: true },
  },
} satisfies Prisma.WorkerProfileSelect;

/**
 * The public worker profile read (PROMPT 46; PRO-01, PRO-02, PRO-03).
 *
 * The whole screen in one round trip is the stated requirement, and the reason
 * it matters here more than elsewhere: this is where a client decides whether to
 * let a stranger into their home. Six sequential requests on a Douala 3G
 * connection turns that decision into a wait, and people leave.
 *
 * What that costs is one big select and four small side queries that CANNOT be
 * folded into it — endorsements and verifications hang off the USER, not the
 * profile, upcoming exceptions need a date bound Prisma cannot express inside a
 * nested select, and answered invitations (for the response-time stat) are keyed
 * by workerId rather than profile id. Five parallel statements, never N+1.
 */
@Injectable()
export class WorkerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findByUserId(userId: string): Promise<WorkerProfileView> {
    return this.load({ userId });
  }

  async findById(id: string): Promise<WorkerProfileView> {
    return this.load({ id });
  }

  private async load(where: { id?: string; userId?: string }): Promise<WorkerProfileView> {
    const started = Date.now();

    const profile = await this.prisma.client.workerProfile.findUnique({
      where: where.id ? { id: where.id } : { userId: where.userId },
      select: WORKER_PROFILE_SELECT,
    });

    if (!profile) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PROFILE_NOT_FOUND',
        'That profile does not exist.',
      );
    }

    const score = profile.user.trustScoreRecord;

    // A trust-suspended identity is hidden entirely rather than shown with a
    // zero score (TRU-08). Suspension follows confirmed fraudulent documents,
    // and leaving the profile reachable would let a suspended worker keep
    // sending clients a link to it.
    if (score?.suspended) {
      logger.warn('Suspended profile requested', { payload: { userId: profile.userId } });
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PROFILE_NOT_FOUND',
        'That profile does not exist.',
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [endorsements, verifications, exceptions, answeredInvitations] = await Promise.all([
      this.prisma.client.endorsement.findMany({
        where: {
          subjectId: profile.userId,
          status: EndorsementStatus.APPROVED,
          revokedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          relationship: true,
          quote: true,
          rating: true,
          authorId: true,
          authorName: true,
          createdAt: true,
          author: { select: { name: true } },
        },
      }),
      // The latest APPROVED attempt per check type. Ordered so the reduce below
      // keeps the first (newest) row it meets for each type.
      this.prisma.client.verificationRecord.findMany({
        where: { subjectId: profile.userId, status: VerificationStatus.VERIFIED },
        orderBy: { reviewedAt: 'desc' },
        select: { checkType: true, reviewedAt: true },
      }),
      // Only UPCOMING exceptions. A client planning next week does not need to
      // know the worker took last Christmas off.
      this.prisma.client.availabilityException.findMany({
        where: { workerProfileId: profile.id, date: { gte: today } },
        orderBy: { date: 'asc' },
        take: 30,
        select: {
          id: true,
          date: true,
          isAvailable: true,
          startTime: true,
          endTime: true,
          note: true,
        },
      }),
      // The response-time stat (PRO-01): only invitations the worker actually
      // ANSWERED (accept or decline) count — a CANCELLED or still-PENDING one
      // says nothing about how fast this worker responds.
      this.prisma.client.jobInvitation.findMany({
        where: {
          workerId: profile.userId,
          status: { in: [JobInvitationStatus.ACCEPTED, JobInvitationStatus.DECLINED] },
          respondedAt: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: { createdAt: true, respondedAt: true },
      }),
    ]);

    const durationMs = Date.now() - started;
    if (durationMs > SLOW_QUERY_MS) {
      logger.warn('Slow worker profile read', {
        durationMs,
        payload: { workerProfileId: profile.id },
      });
    }

    const uniqueVerifications = [
      ...new Map(verifications.map((record) => [record.checkType, record])).values(),
    ];

    const portfolio = await this.groupPortfolio(profile.portfolio);
    const portfolioCount = profile.portfolio.length;
    const responseTime = computeResponseTimeStat(
      answeredInvitations.map((invitation) => ({
        createdAt: invitation.createdAt,
        respondedAt: invitation.respondedAt as Date,
      })),
    );

    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.user.name,
      avatar: profile.user.avatar,
      coverUrl: profile.cover
        ? await this.storage.urlFor(profile.cover.s3Key, profile.cover.visibility)
        : null,
      headline: profile.headline,
      bio: profile.bio,
      yearsExperience: profile.yearsExperience,
      city: profile.city,
      area: profile.area,
      landmark: profile.landmark,
      tier: profile.user.tier,
      // Prefer the TrustScore snapshot; fall back to the denormalised column on
      // User for an identity that has never been scored.
      trustScore: score?.total ?? profile.user.trustScore,
      identityScore: score?.identityScore ?? 0,
      professionalScore: score?.professionalScore ?? 0,
      marketplaceScore: score?.marketplaceScore ?? 0,
      financialScore: score?.financialScore ?? 0,
      stats: {
        completedJobs: score?.completedJobs ?? 0,
        averageRating:
          score?.averageRating === null ? null : Number(score?.averageRating ?? 0) || null,
        endorsementCount: endorsements.length,
        portfolioCount,
        verifiedCheckCount: uniqueVerifications.length,
        // PRO-01 asks for on-time %. Nothing can measure it until jobs have
        // scheduled and actual completion times (Phase 4), so it is reported as
        // "not scored" rather than invented — the same discipline the Trust
        // Engine applies to its financial pillar.
        onTimePercentage: null,
        onTimeScored: false,
        respondsWithinMinutes: responseTime.respondsWithinMinutes,
        responseTimeScored: responseTime.scored,
      },
      services: profile.services
        // A service filed under a retired category keeps its listing but loses
        // the category label: showing a dead category as a live chip would offer
        // a browse link that returns nothing.
        .map((service) => ({
          id: service.id,
          name: service.name,
          description: service.description,
          startingPrice: service.startingPrice,
          categoryId: service.category?.isActive ? service.categoryId : null,
          categorySlug: service.category?.isActive ? service.category.slug : null,
          categoryNameEn: service.category?.isActive ? service.category.nameEn : null,
          categoryNameFr: service.category?.isActive ? service.category.nameFr : null,
        })),
      portfolio,
      availability: groupByDay(profile.availability),
      availabilityExceptions: exceptions.map((exception) => ({
        id: exception.id,
        date: toDateString(exception.date),
        isAvailable: exception.isAvailable,
        startTime: exception.startTime,
        endTime: exception.endTime,
        note: exception.note,
      })),
      verifications: uniqueVerifications.map((record) => ({
        checkType: record.checkType,
        verifiedAt: record.reviewedAt,
      })),
      endorsements: endorsements.map((endorsement) => ({
        id: endorsement.id,
        relationship: endorsement.relationship,
        relationshipKey: `endorsement.relationship.${endorsement.relationship.toLowerCase()}`,
        quote: endorsement.quote,
        rating: endorsement.rating,
        authorName: endorsement.author?.name ?? endorsement.authorName,
        authorId: endorsement.authorId,
        onPlatform: endorsement.authorId !== null,
        createdAt: endorsement.createdAt,
      })),
      reviews: {
        averageRating:
          score?.averageRating === null ? null : Number(score?.averageRating ?? 0) || null,
        ratedJobCount: score?.completedJobs ?? 0,
        // The aggregate is real (the Trust Engine maintains it); the list of
        // individual reviews is not available until Phase 5. Saying so beats
        // returning an empty array that reads as "nobody has reviewed them".
        reviewListAvailable: false,
      },
      memberSince: profile.user.createdAt,
    };
  }

  /**
   * Groups portfolio items into projects and before/after pairs (PRO-02).
   *
   * Ungrouped items collect into a single trailing group with a null key rather
   * than one group each: a gallery of eleven one-item "projects" is not a
   * grouping, it is a grid with extra headings.
   */
  private async groupPortfolio(items: PortfolioRow[]): Promise<PortfolioGroupView[]> {
    const resolved = await Promise.all(
      items.map(async (item) => ({
        id: item.id,
        type: item.type,
        caption: item.caption,
        url: await this.storage.urlFor(item.mediaAsset.s3Key, item.mediaAsset.visibility),
        slot: item.slot,
        sortOrder: item.sortOrder,
        createdAt: item.createdAt,
        groupKey: item.groupKey,
        projectTitle: item.projectTitle,
      })),
    );

    const groups = new Map<string, PortfolioGroupView>();
    const ungrouped: PortfolioGroupView['items'] = [];

    for (const item of resolved) {
      const { groupKey, projectTitle, ...view } = item;

      if (!groupKey) {
        ungrouped.push(view);
        continue;
      }

      const group = groups.get(groupKey) ?? {
        groupKey,
        projectTitle,
        items: [],
        isBeforeAfter: false,
      };

      group.items.push(view);
      groups.set(groupKey, group);
    }

    const result = [...groups.values()].map((group) => ({
      ...group,
      isBeforeAfter:
        group.items.some((item) => item.slot === PortfolioSlot.BEFORE) &&
        group.items.some((item) => item.slot === PortfolioSlot.AFTER),
    }));

    if (ungrouped.length > 0) {
      result.push({ groupKey: null, projectTitle: null, items: ungrouped, isBeforeAfter: false });
    }

    return result;
  }
}

/** A DATE column is a calendar day; rendering it as an ISO instant would bind it to a timezone. */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
