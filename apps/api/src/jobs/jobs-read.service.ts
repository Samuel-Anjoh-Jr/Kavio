import { Injectable } from '@nestjs/common';
import { JobStatus, JobUrgency, JobVisibility, MediaVisibility, Prisma } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ClientReliabilityService } from './client-reliability.service';
import type {
  ClientReliabilityView,
  JobApplicationView,
  JobInvitationView,
  JobListView,
  JobStatusEventView,
  JobView,
  WorkerPreviewView,
} from './models/job.model';

const logger = createLogger('jobs.read');

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

/** The shape the board queries return — a job with the joins mapJob reads. */
interface JobWithIncludes {
  id: string;
  posterId: string;
  poster: { name: string | null };
  categoryId: string | null;
  category: { slug: string; nameEn: string; nameFr: string } | null;
  title: string | null;
  description: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  urgency: JobUrgency;
  status: JobStatus;
  city: string | null;
  area: string | null;
  landmark: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  photos: Array<{
    id: string;
    sortOrder: number;
    mediaAsset: { s3Key: string; visibility: MediaVisibility };
  }>;
  _count: { applications: number; quotes: number };
}

export interface JobBoardFilter {
  categoryId?: string;
  geoRegionId?: string;
  urgency?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Job READS (PROMPTS 55, 57; JOB-03, JOB-04). Every method here is a GraphQL
 * resolver's backing call — writes are on the REST controllers.
 *
 * The one thing this service is disciplined about is N+1: an applicant list is a
 * list of workers, and building each worker's trust card with its own query
 * would be the classic list-of-N-round-trips bug. Worker previews are batched —
 * one query for the users, one for the profiles, one for the scores — no matter
 * how many applicants there are.
 */
@Injectable()
export class JobsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    /** The poster-side trust card, batched — see ClientReliabilityService. */
    private readonly clientReliability: ClientReliabilityService,
  ) {}

  /**
   * A single job's public detail. The timeline is included only for the poster
   * or the hired worker — a guest sees the job, not its private history.
   */
  async getJob(id: string, viewer: AuthenticatedUser | undefined): Promise<JobView | null> {
    const job = await this.prisma.client.job.findUnique({
      where: { id },
      include: {
        poster: { select: { name: true } },
        category: { select: { slug: true, nameEn: true, nameFr: true } },
        photos: {
          orderBy: { sortOrder: 'asc' },
          include: { mediaAsset: { select: { s3Key: true, visibility: true } } },
        },
        _count: { select: { applications: true, quotes: true } },
      },
    });

    if (!job) {
      return null;
    }

    // A guest can read published jobs; a draft is only its poster's to see.
    const isParty = viewer ? await this.isJobParty(job.id, job.posterId, viewer.id) : false;
    if (job.status === JobStatus.DRAFT && !isParty) {
      return null;
    }

    const timeline = isParty ? await this.timelineFor(job.id) : [];

    return this.mapJob(
      job,
      timeline,
      await this.photoUrls(job.photos),
      await this.clientReliability.forClient(job.posterId),
    );
  }

  /** The public job board (JOB-04): open jobs, filterable, newest published first. */
  async listJobs(filter: JobBoardFilter): Promise<JobListView> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filter.pageSize ?? DEFAULT_PAGE_SIZE));

    const where: Prisma.JobWhereInput = {
      status: JobStatus.OPEN,
      // The board is PUBLIC listings only. A DIRECT engagement is an open job
      // too — a client hiring one worker they chose — but it was never
      // advertised, and putting it here would expose a private arrangement to
      // every visitor and invite quotes nobody asked for.
      visibility: JobVisibility.PUBLIC,
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.geoRegionId ? { geoRegionId: filter.geoRegionId } : {}),
      ...(filter.urgency ? { urgency: filter.urgency as Prisma.JobWhereInput['urgency'] } : {}),
    };

    const [total, jobs] = await Promise.all([
      this.prisma.client.job.count({ where }),
      this.prisma.client.job.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.listInclude(),
      }),
    ]);

    const views = await this.mapJobs(jobs);
    return { jobs: views, total, page, pageSize, hasMore: page * pageSize < total };
  }

  /** The poster's own jobs, drafts included (JOB-07). */
  async listMyJobs(user: AuthenticatedUser, filter: JobBoardFilter = {}): Promise<JobListView> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filter.pageSize ?? DEFAULT_PAGE_SIZE));

    const where: Prisma.JobWhereInput = { posterId: user.id };

    const [total, jobs] = await Promise.all([
      this.prisma.client.job.count({ where }),
      this.prisma.client.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.listInclude(),
      }),
    ]);

    const views = await this.mapJobs(jobs);
    return { jobs: views, total, page, pageSize, hasMore: page * pageSize < total };
  }

  /** The poster's applicant list for one job (JOB-03), with worker cards. */
  async listApplicants(user: AuthenticatedUser, jobId: string): Promise<JobApplicationView[]> {
    // Scoped to the poster in the WHERE: another client's job id returns empty,
    // never a leak that the id is real.
    const job = await this.prisma.client.job.findFirst({
      where: { id: jobId, posterId: user.id },
      select: { id: true },
    });
    if (!job) {
      return [];
    }

    const applications = await this.prisma.client.jobApplication.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
    });

    const previews = await this.workerPreviews(applications.map((a) => a.workerId));

    return applications.map((a) => ({
      id: a.id,
      jobId: a.jobId,
      jobTitle: null,
      status: a.status,
      message: a.message,
      worker: previews.get(a.workerId) ?? null,
      createdAt: a.createdAt,
    }));
  }

  /** The worker's own application tracker (JOB-04). */
  async listMyApplications(user: AuthenticatedUser): Promise<JobApplicationView[]> {
    const applications = await this.prisma.client.jobApplication.findMany({
      where: { workerId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { job: { select: { title: true } } },
    });

    return applications.map((a) => ({
      id: a.id,
      jobId: a.jobId,
      jobTitle: a.job.title,
      status: a.status,
      message: a.message,
      worker: null,
      createdAt: a.createdAt,
    }));
  }

  /**
   * The worker's incoming Job Requests (JOB-03, JOB-04).
   *
   * Carries the CLIENT's reliability card, not the worker's: this is the screen
   * where a worker decides whether to accept, and they should not have to commit
   * to an identity they know nothing about.
   */
  async listMyInvitations(user: AuthenticatedUser): Promise<JobInvitationView[]> {
    const invitations = await this.prisma.client.jobInvitation.findMany({
      where: { workerId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { job: { select: { title: true, posterId: true } } },
    });

    const reliability = await this.clientReliability.forClients(
      invitations.map((i) => i.job.posterId),
    );

    return invitations.map((i) => ({
      id: i.id,
      jobId: i.jobId,
      jobTitle: i.job.title,
      status: i.status,
      message: i.message,
      worker: null,
      client: reliability.get(i.job.posterId) ?? null,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    }));
  }

  /** The poster's view of who they invited to a job (JOB-03). */
  async listJobInvitations(user: AuthenticatedUser, jobId: string): Promise<JobInvitationView[]> {
    const job = await this.prisma.client.job.findFirst({
      where: { id: jobId, posterId: user.id },
      select: { id: true },
    });
    if (!job) {
      return [];
    }

    const invitations = await this.prisma.client.jobInvitation.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
    });

    const previews = await this.workerPreviews(invitations.map((i) => i.workerId));

    return invitations.map((i) => ({
      id: i.id,
      jobId: i.jobId,
      jobTitle: null,
      status: i.status,
      message: i.message,
      worker: previews.get(i.workerId) ?? null,
      // The poster is looking at who THEY invited; their own card would tell
      // them nothing they do not already know.
      client: null,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  private listInclude() {
    return {
      poster: { select: { name: true } },
      category: { select: { slug: true, nameEn: true, nameFr: true } },
      photos: {
        orderBy: { sortOrder: 'asc' as const },
        include: { mediaAsset: { select: { s3Key: true, visibility: true } } },
      },
      _count: { select: { applications: true, quotes: true } },
    };
  }

  private async mapJobs(jobs: JobWithIncludes[]): Promise<JobView[]> {
    // ONE batch for the whole page. Building a poster's reliability card per row
    // would be the same N+1 that `workerPreviews` exists to prevent, just facing
    // the other way.
    const reliability = await this.clientReliability.forClients(jobs.map((job) => job.posterId));

    return Promise.all(
      jobs.map(async (job) =>
        this.mapJob(
          job,
          [],
          await this.photoUrls(job.photos),
          reliability.get(job.posterId) ?? null,
        ),
      ),
    );
  }

  private mapJob(
    job: Omit<JobWithIncludes, 'photos'>,
    timeline: JobStatusEventView[],
    photos: JobView['photos'],
    posterReliability: ClientReliabilityView | null,
  ): JobView {
    return {
      id: job.id,
      posterId: job.posterId,
      posterName: job.poster.name,
      posterReliability,
      categoryId: job.categoryId,
      categorySlug: job.category?.slug ?? null,
      categoryNameEn: job.category?.nameEn ?? null,
      categoryNameFr: job.category?.nameFr ?? null,
      title: job.title,
      description: job.description,
      budgetMin: job.budgetMin,
      budgetMax: job.budgetMax,
      urgency: job.urgency,
      status: job.status,
      city: job.city,
      area: job.area,
      landmark: job.landmark,
      photos,
      applicationCount: job._count.applications,
      quoteCount: job._count.quotes,
      timeline,
      publishedAt: job.publishedAt,
      createdAt: job.createdAt,
    };
  }

  private async timelineFor(jobId: string): Promise<JobStatusEventView[]> {
    const events = await this.prisma.client.jobStatusEvent.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
      select: { fromStatus: true, toStatus: true, note: true, createdAt: true },
    });
    return events;
  }

  private async photoUrls(
    photos: Array<{
      id: string;
      sortOrder: number;
      mediaAsset: { s3Key: string; visibility: MediaVisibility };
    }>,
  ): Promise<JobView['photos']> {
    return Promise.all(
      photos.map(async (photo) => ({
        id: photo.id,
        sortOrder: photo.sortOrder,
        url: await this.storage.urlFor(photo.mediaAsset.s3Key, photo.mediaAsset.visibility),
      })),
    );
  }

  private async isJobParty(jobId: string, posterId: string, userId: string): Promise<boolean> {
    if (userId === posterId) {
      return true;
    }
    const booking = await this.prisma.client.booking.findFirst({
      where: { jobId, workerId: userId },
      select: { id: true },
    });
    return booking !== null;
  }

  /**
   * Batched worker cards for a set of ids — three queries total regardless of
   * count. This is the N+1 guard the whole service exists to hold.
   */
  private async workerPreviews(workerIds: string[]): Promise<Map<string, WorkerPreviewView>> {
    const ids = [...new Set(workerIds)];
    if (ids.length === 0) {
      return new Map();
    }

    const [users, profiles, scores] = await Promise.all([
      this.prisma.client.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, avatar: true, tier: true, trustScore: true },
      }),
      this.prisma.client.workerProfile.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, headline: true, city: true },
      }),
      this.prisma.client.trustScore.findMany({
        where: { subjectId: { in: ids } },
        select: { subjectId: true, completedJobs: true, averageRating: true },
      }),
    ]);

    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
    const scoreByUser = new Map(scores.map((s) => [s.subjectId, s]));

    const previews = new Map<string, WorkerPreviewView>();
    for (const user of users) {
      const profile = profileByUser.get(user.id);
      const score = scoreByUser.get(user.id);
      previews.set(user.id, {
        workerId: user.id,
        name: user.name,
        avatar: user.avatar,
        headline: profile?.headline ?? null,
        city: profile?.city ?? null,
        tier: user.tier,
        trustScore: user.trustScore,
        completedJobs: score?.completedJobs ?? 0,
        averageRating: score?.averageRating != null ? Number(score.averageRating) : null,
      });
    }

    logger.info('Worker previews built', { payload: { count: previews.size } });
    return previews;
  }
}
