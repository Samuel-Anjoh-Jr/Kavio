import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  DisputeFaultParty,
  DisputeStatus,
  JobStatus,
  ReviewStatus,
} from '@trustpro/database';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { roundToTwo } from '../reviews/review.model';
import type { ClientReliabilityView } from './models/job.model';

const logger = createLogger('jobs:client-reliability');

/** Bookings in which the client actually paid for and received the work. */
const COMPLETED_CLIENT_BOOKINGS: readonly BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.RELEASED,
];

/**
 * The client-side trust card a worker reads before committing (JOB-03, JOB-04).
 *
 * The marketplace was only legible in one direction: a client browsing workers
 * saw a Trust Score, a tier, a rating and a completed-job count, while a worker
 * deciding whether to accept a job request or spend a quote on a posted job saw
 * a name. That asymmetry is a real risk for the worker — they are the one who
 * turns up, does the work and waits to be paid — so this is the mirror image of
 * WorkerPreviewView, built from the same kinds of fact.
 *
 * Everything here is ALREADY PUBLIC in substance: `trustScore` and `tier` are
 * shown wherever an identity appears (TRU-01), and reviews are public (REV-02).
 * What this adds is the client-side reading of them, plus the two signals a
 * worker actually cares about and cannot infer — how often this client sees a
 * job through, and how often a dispute they raised was found against them.
 *
 * BATCHED, always. A job board page is a list of jobs with a poster each, and
 * building this card per row would be the exact N+1 the jobs read service exists
 * to avoid. Five queries, regardless of how many clients are asked for.
 */
@Injectable()
export class ClientReliabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** One client's card. Convenience wrapper over the batched path. */
  async forClient(clientId: string): Promise<ClientReliabilityView | null> {
    const cards = await this.forClients([clientId]);
    return cards.get(clientId) ?? null;
  }

  /**
   * Reliability cards for a set of client identities, keyed by id.
   *
   * Clients with no history still get a card — a first-time poster is not a
   * suspicious one, and omitting them would make the UI render an empty space
   * that reads as "something is wrong with this person".
   */
  async forClients(clientIds: string[]): Promise<Map<string, ClientReliabilityView>> {
    const ids = [...new Set(clientIds)];
    if (ids.length === 0) {
      return new Map();
    }

    const started = Date.now();

    const [users, postedGroups, bookingGroups, ratingGroups, lostDisputes] = await Promise.all([
      this.prisma.client.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          avatar: true,
          tier: true,
          trustScore: true,
          createdAt: true,
        },
      }),
      // Published posts only. A draft nobody ever put into the market is not
      // evidence of anything, and counting it would inflate the completion rate's
      // denominator with jobs no worker could ever have seen.
      this.prisma.client.job.groupBy({
        by: ['posterId'],
        where: { posterId: { in: ids }, status: { not: JobStatus.DRAFT } },
        _count: { _all: true },
      }),
      this.prisma.client.booking.groupBy({
        by: ['clientId', 'status'],
        where: { clientId: { in: ids } },
        _count: { _all: true },
      }),
      // Reviews ABOUT the client — the worker-reviews-client direction REV-01
      // grants. Grouped by rating so the average is one query, not one per client.
      this.prisma.client.review.groupBy({
        by: ['subjectId', 'rating'],
        where: { subjectId: { in: ids }, status: ReviewStatus.PUBLISHED },
        _count: { _all: true },
      }),
      // Disputes found against the client. Not a groupBy: Prisma cannot group on
      // a relation field, and the row count here is small by nature — a client
      // with many lost disputes is exactly the rare case this card exists for.
      this.prisma.client.dispute.findMany({
        where: {
          status: DisputeStatus.RESOLVED,
          faultParty: DisputeFaultParty.CLIENT,
          booking: { clientId: { in: ids } },
        },
        select: { booking: { select: { clientId: true } } },
      }),
    ]);

    const postedByClient = new Map(postedGroups.map((g) => [g.posterId, g._count._all]));

    const completedByClient = new Map<string, number>();
    const cancelledByClient = new Map<string, number>();
    for (const group of bookingGroups) {
      if (COMPLETED_CLIENT_BOOKINGS.includes(group.status)) {
        completedByClient.set(
          group.clientId,
          (completedByClient.get(group.clientId) ?? 0) + group._count._all,
        );
      } else if (group.status === BookingStatus.CANCELLED) {
        cancelledByClient.set(
          group.clientId,
          (cancelledByClient.get(group.clientId) ?? 0) + group._count._all,
        );
      }
    }

    const ratingSum = new Map<string, number>();
    const ratingCount = new Map<string, number>();
    for (const group of ratingGroups) {
      ratingSum.set(
        group.subjectId,
        (ratingSum.get(group.subjectId) ?? 0) + group.rating * group._count._all,
      );
      ratingCount.set(group.subjectId, (ratingCount.get(group.subjectId) ?? 0) + group._count._all);
    }

    const lostByClient = new Map<string, number>();
    for (const dispute of lostDisputes) {
      const clientId = dispute.booking.clientId;
      lostByClient.set(clientId, (lostByClient.get(clientId) ?? 0) + 1);
    }

    const cards = new Map<string, ClientReliabilityView>();
    for (const user of users) {
      const rated = ratingCount.get(user.id) ?? 0;
      const jobsPosted = postedByClient.get(user.id) ?? 0;
      const jobsCompleted = completedByClient.get(user.id) ?? 0;

      cards.set(user.id, {
        clientId: user.id,
        name: user.name,
        avatar: user.avatar,
        tier: user.tier,
        trustScore: user.trustScore,
        jobsPosted,
        jobsCompleted,
        // Null, never 0, before anything has been posted: a brand-new client must
        // read as "new", not as "never finishes a job".
        completionRate: jobsPosted === 0 ? null : roundToTwo(jobsCompleted / jobsPosted),
        averageRating: rated === 0 ? null : roundToTwo((ratingSum.get(user.id) ?? 0) / rated),
        ratedJobs: rated,
        cancelledBookings: cancelledByClient.get(user.id) ?? 0,
        disputesLost: lostByClient.get(user.id) ?? 0,
        memberSince: user.createdAt,
      });
    }

    const durationMs = Date.now() - started;
    if (durationMs > 300) {
      logger.warn('Client reliability batch exceeded the slow-query budget', {
        result: { count: cards.size },
        durationMs,
      });
    }

    logger.info('Client reliability cards built', { payload: { count: cards.size } });
    return cards;
  }
}
