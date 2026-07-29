import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  EscrowState,
  JobApplicationStatus,
  JobStatus,
  ReviewStatus,
  TransactionStatus,
} from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { roundToTwo } from '../reviews/review.model';
import { BusinessAccessService } from './business-access.service';
import type {
  BusinessAnalyticsView,
  BusinessDashboardView,
  BusinessSpendView,
} from './models/business.model';

const logger = createLogger('business:analytics');

/** Jobs still working for the company — posted and not yet closed out. */
const ACTIVE_JOB_STATUSES: readonly JobStatus[] = [
  JobStatus.OPEN,
  JobStatus.QUOTED,
  JobStatus.ACCEPTED,
];

/** Escrow states in which the company's money is committed but not settled. */
const LIVE_ESCROW_STATES: readonly EscrowState[] = [
  EscrowState.PAID,
  EscrowState.ACCEPTED,
  EscrowState.IN_PROGRESS,
  EscrowState.COMPLETED,
  EscrowState.DISPUTED,
];

/** How many payments the dashboard's "recent" strip shows. */
const RECENT_PAYMENTS = 10;

/**
 * The business dashboard and analytics (BIZ-02, BIZ-03).
 *
 * THERE IS NO COMPANY WALLET. A business has SPEND, not a balance — nothing can
 * be paid into a company here and nothing out of it.
 *
 * That is a deliberate product decision, not an omission. Money in Kavio flows
 * through an IDENTITY: a person funds an escrow from their own wallet, Campay
 * confirms, the escrow settles to the worker. A company float would be a second
 * pot with its own balance, needing Campay top-up collection, a way to spend
 * company funds instead of personal ones, withdrawal back out, and a permanent
 * reconciliation between two balances. `Wallet.availableBalance` is documented as
 * a cache the Transaction ledger can rebuild; a company balance nobody can
 * rebuild from the ledger is the thing most likely to drift and be quietly wrong
 * about real money.
 *
 * So what a business sees is a SCOPED AGGREGATE over the same ledger: every
 * EscrowHold on a job posted for this company. Committed, settled, refunded and
 * recent payments reconcile with the transaction history by construction, because
 * they ARE the transaction history, filtered. If a real company float is ever
 * wanted, it is a feature with its own prompt — not a column added here.
 */
@Injectable()
export class BusinessAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
  ) {}

  /** Active posts, applications, in-progress/completed, spend, payments (BIZ-02). */
  async dashboard(
    user: AuthenticatedUser,
    businessProfileId: string,
  ): Promise<BusinessDashboardView> {
    await this.access.require(user, businessProfileId, 'business:view');
    const started = Date.now();

    const [jobGroups, applications, bookingGroups, business] = await Promise.all([
      // One grouped query for every job state, not a count per tile.
      this.prisma.client.job.groupBy({
        by: ['status'],
        where: { businessProfileId },
        _count: { _all: true },
      }),
      this.prisma.client.jobApplication.count({
        where: {
          job: { businessProfileId },
          status: { in: [JobApplicationStatus.SUBMITTED, JobApplicationStatus.UNDER_REVIEW] },
        },
      }),
      this.prisma.client.booking.groupBy({
        by: ['status'],
        where: { job: { businessProfileId } },
        _count: { _all: true },
        _sum: { agreedPrice: true },
      }),
      this.prisma.client.businessProfile.findUnique({
        where: { id: businessProfileId },
        select: { id: true, name: true, verified: true },
      }),
    ]);

    const jobsByStatus = new Map(jobGroups.map((group) => [group.status, group._count._all]));
    const bookingsByStatus = new Map(
      bookingGroups.map((group) => [group.status, group._count._all]),
    );

    const durationMs = Date.now() - started;
    if (durationMs > 300) {
      logger.warn('Business dashboard exceeded the slow-query budget', {
        result: { businessProfileId },
        durationMs,
      });
    }

    return {
      businessProfileId,
      name: business?.name ?? '',
      verified: business?.verified ?? false,
      activePosts: ACTIVE_JOB_STATUSES.reduce(
        (sum, status) => sum + (jobsByStatus.get(status) ?? 0),
        0,
      ),
      draftPosts: jobsByStatus.get(JobStatus.DRAFT) ?? 0,
      pendingApplications: applications,
      inProgressJobs: bookingsByStatus.get(BookingStatus.IN_PROGRESS) ?? 0,
      completedJobs:
        (bookingsByStatus.get(BookingStatus.COMPLETED) ?? 0) +
        (bookingsByStatus.get(BookingStatus.RELEASED) ?? 0),
      spend: await this.spendSummary(businessProfileId),
    };
  }

  /** Jobs posted, hire rate, spend, average rating (BIZ-03). */
  async analytics(
    user: AuthenticatedUser,
    businessProfileId: string,
  ): Promise<BusinessAnalyticsView> {
    await this.access.require(user, businessProfileId, 'business:view');
    const started = Date.now();

    const [jobsPosted, jobsHired, released, ratings] = await Promise.all([
      // Posted, not drafted: a draft nobody published is not a job the company
      // put into the market, and counting it inflates every rate below it.
      this.prisma.client.job.count({
        where: { businessProfileId, status: { not: JobStatus.DRAFT } },
      }),
      // A job that produced a booking is a job that resulted in a hire.
      this.prisma.client.job.count({
        where: { businessProfileId, bookings: { some: {} } },
      }),
      this.prisma.client.booking.aggregate({
        where: { job: { businessProfileId }, status: BookingStatus.RELEASED },
        _sum: { agreedPrice: true },
        _count: { _all: true },
      }),
      // How this company's WORKERS were rated on its jobs — the quality of the
      // work it commissioned. Not the company's own rating: a business is the
      // client here, and its reviews-received are a different number entirely.
      this.prisma.client.review.groupBy({
        by: ['rating'],
        where: { job: { businessProfileId }, status: ReviewStatus.PUBLISHED },
        _count: { _all: true },
      }),
    ]);

    const ratingCount = ratings.reduce((sum, group) => sum + group._count._all, 0);
    const ratingTotal = ratings.reduce((sum, group) => sum + group.rating * group._count._all, 0);

    const durationMs = Date.now() - started;
    if (durationMs > 300) {
      logger.warn('Business analytics exceeded the slow-query budget', {
        result: { businessProfileId },
        durationMs,
      });
    }

    return {
      businessProfileId,
      jobsPosted,
      jobsHired,
      // Null rather than 0 when nothing has been posted: "we hire 0% of the time"
      // and "we have not posted yet" are different facts, and a new company
      // should not open its dashboard to a 0% hire rate.
      hireRate: jobsPosted === 0 ? null : roundToTwo(jobsHired / jobsPosted),
      completedJobs: released._count._all,
      totalSpent: released._sum.agreedPrice ?? 0,
      averageJobValue:
        released._count._all === 0
          ? null
          : Math.round((released._sum.agreedPrice ?? 0) / released._count._all),
      averageRating: ratingCount === 0 ? null : roundToTwo(ratingTotal / ratingCount),
      ratedJobs: ratingCount,
    };
  }

  /**
   * What the company has spent and committed (BIZ-02, BIZ-03).
   *
   * A summary of money that has ALREADY MOVED — not a balance, and not spendable.
   * Read by `dashboard` for its headline tiles, which every access level can see.
   * The transaction DETAIL is gated on `business:payments` in
   * {@link companyPayments}: how much the company has spent is management
   * information, and who was paid what and when is finance.
   */
  async spendSummary(businessProfileId: string): Promise<BusinessSpendView> {
    const [committed, settled, refunded] = await Promise.all([
      this.prisma.client.escrowHold.aggregate({
        where: { booking: { job: { businessProfileId } }, state: { in: [...LIVE_ESCROW_STATES] } },
        _sum: { amount: true },
      }),
      this.prisma.client.escrowHold.aggregate({
        where: { booking: { job: { businessProfileId } }, state: EscrowState.RELEASED },
        _sum: { amount: true, feeAmount: true },
      }),
      this.prisma.client.escrowHold.aggregate({
        where: { booking: { job: { businessProfileId } }, state: EscrowState.REFUNDED },
        _sum: { amount: true },
      }),
    ]);

    return {
      businessProfileId,
      committedToEscrow: committed._sum.amount ?? 0,
      totalSpent: settled._sum.amount ?? 0,
      platformFees: settled._sum.feeAmount ?? 0,
      totalRefunded: refunded._sum.amount ?? 0,
    };
  }

  /** Recent payments against the company's jobs (BIZ-02). Finance-gated. */
  async companyPayments(user: AuthenticatedUser, businessProfileId: string) {
    await this.access.require(user, businessProfileId, 'business:payments');

    const rows = await this.prisma.client.transaction.findMany({
      where: {
        booking: { job: { businessProfileId } },
        status: TransactionStatus.SUCCESS,
      },
      orderBy: { createdAt: 'desc' },
      take: RECENT_PAYMENTS,
      select: {
        id: true,
        type: true,
        amount: true,
        description: true,
        createdAt: true,
        settledAt: true,
        bookingId: true,
        booking: { select: { job: { select: { title: true } } } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: row.amount,
      description: row.description,
      jobTitle: row.booking?.job.title ?? null,
      bookingId: row.bookingId,
      createdAt: row.createdAt,
      settledAt: row.settledAt,
    }));
  }
}
