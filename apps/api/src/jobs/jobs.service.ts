import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JobStatus, LocationSource, MediaAssetKind, Prisma } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BusinessAccessService } from '../business/business-access.service';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { ReverseGeocodeService } from '../geo/reverse-geocode.service';
import type { CreateJobDto, PatchJobDto } from './dto/job.dto';
import {
  JOB_PUBLISHED,
  JOB_STATUS_CHANGED,
  JobPublishedEvent,
  JobStatusChangedEvent,
} from './events/job.events';
import {
  isTransitionAllowedFor,
  jobTransitionRule,
  type TransitionActor,
} from './job-lifecycle.model';
import { JobPostingGateService } from './job-posting-gate.service';

const logger = createLogger('jobs');

/** A job's fields the lifecycle logic needs, loaded once per transition. */
const JOB_CORE_SELECT = {
  id: true,
  posterId: true,
  status: true,
  publishedAt: true,
} as const;

export interface JobRow {
  id: string;
  posterId: string;
  categoryId: string | null;
  title: string | null;
  description: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  urgency: string;
  status: JobStatus;
  city: string | null;
  area: string | null;
  landmark: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

const JOB_ROW_SELECT = {
  id: true,
  posterId: true,
  categoryId: true,
  title: true,
  description: true,
  budgetMin: true,
  budgetMax: true,
  urgency: true,
  status: true,
  city: true,
  area: true,
  landmark: true,
  publishedAt: true,
  createdAt: true,
} as const;

/** Passed by internal callers (the quotes module) that move a job as the system. */
export interface SystemTransitionOptions {
  actorId?: string | null;
  note?: string | null;
  requestId?: string;
}

/**
 * The demand side: creating, editing, publishing and moving jobs (PROMPT 55;
 * JOB-01, JOB-02, JOB-05, JOB-07). Writes only — every read is on JobsResolver.
 *
 * Two invariants this service is built around:
 *
 *   1. A job is only PUBLISHED through the Tier 2+ gate (JOB-01). There is no
 *      other path to OPEN, so there is no way to have an open job posted by an
 *      unverified account.
 *
 *   2. `status` only ever moves through the state machine, and every move writes
 *      a JobStatusEvent in the SAME transaction. The timeline is therefore a
 *      complete record by construction, not something a caller can forget to
 *      append to.
 */
@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly gate: JobPostingGateService,
    private readonly reverseGeocode: ReverseGeocodeService,
    /** Resolves whether the poster may act for a business (BIZ-02). */
    private readonly businessAccess: BusinessAccessService,
  ) {}

  /**
   * Starts a draft (JOB-02). Deliberately permissive: a draft may be almost
   * empty and filled in across the stepper's autosaves. Completeness is checked
   * at PUBLISH, so autosave never rejects a half-typed field.
   */
  async createDraft(user: AuthenticatedUser, dto: CreateJobDto): Promise<JobRow> {
    if (dto.categoryId) {
      await this.assertCategoryUsable(dto.categoryId);
    }

    // Posting for a company is an access-level decision, not a body field
    // (BIZ-02): the caller must actually hold `business:jobs` for it. Checked
    // here rather than at publish, so a draft can never be attributed to a
    // company the poster has no standing with in the first place.
    if (dto.businessProfileId) {
      await this.businessAccess.require(user, dto.businessProfileId, 'business:jobs');
    }

    const location = dto.location ? await this.resolveLocation(dto.location) : null;

    const photoIds = dto.photoAssetIds
      ? await this.assertOwnedPhotos(user.id, dto.photoAssetIds)
      : [];

    const job = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          posterId: user.id,
          // Nullable during drafting: the stepper autosaves before a category is
          // necessarily chosen (JOB-02). publish() refuses to go live without one.
          categoryId: dto.categoryId ?? null,
          title: dto.title ?? null,
          description: dto.description ?? null,
          budgetMin: dto.budgetMin ?? null,
          budgetMax: dto.budgetMax ?? null,
          urgency: dto.urgency ?? undefined,
          status: JobStatus.DRAFT,
          // Kept alongside posterId, never instead of it: the poster is the
          // accountable identity that passed the tier gate, the business is who
          // the spend and the analytics belong to (BIZ-02).
          businessProfileId: dto.businessProfileId ?? null,
          teamSize: dto.teamSize ?? null,
          durationDays: dto.durationDays ?? null,
          ...(location ?? {}),
        } as Prisma.JobUncheckedCreateInput,
        select: JOB_ROW_SELECT,
      });

      await tx.jobStatusEvent.create({
        data: {
          jobId: created.id,
          fromStatus: null,
          toStatus: JobStatus.DRAFT,
          actorId: user.id,
          requestId: getRequestId(),
        },
      });

      if (photoIds.length > 0) {
        await tx.jobPhoto.createMany({
          data: photoIds.map((mediaAssetId, index) => ({
            jobId: created.id,
            mediaAssetId,
            sortOrder: index,
          })),
        });
      }

      return created;
    });

    logger.info('Job draft created', { payload: { jobId: job.id, posterId: user.id } });
    return this.mapRow(job);
  }

  /** Edits a draft (JOB-07). Only a draft is editable; a live job is a contract. */
  async patchDraft(user: AuthenticatedUser, jobId: string, dto: PatchJobDto): Promise<JobRow> {
    const job = await this.requireOwnJob(jobId, user.id);

    if (job.status !== JobStatus.DRAFT) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'JOB_NOT_EDITABLE',
        'Only a draft can be edited. Cancel the job to stop it instead.',
      );
    }

    if (dto.categoryId) {
      await this.assertCategoryUsable(dto.categoryId);
    }

    const location =
      dto.location !== undefined
        ? dto.location
          ? await this.resolveLocation(dto.location)
          : this.clearedLocation()
        : null;

    const photoIds =
      dto.photoAssetIds !== undefined
        ? await this.assertOwnedPhotos(user.id, dto.photoAssetIds)
        : null;

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.job.update({
        where: { id: jobId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.budgetMin !== undefined ? { budgetMin: dto.budgetMin } : {}),
          ...(dto.budgetMax !== undefined ? { budgetMax: dto.budgetMax } : {}),
          ...(dto.urgency !== undefined ? { urgency: dto.urgency } : {}),
          ...(location ?? {}),
        },
        select: JOB_ROW_SELECT,
      });

      if (photoIds) {
        await tx.jobPhoto.deleteMany({ where: { jobId } });
        if (photoIds.length > 0) {
          await tx.jobPhoto.createMany({
            data: photoIds.map((mediaAssetId, index) => ({
              jobId,
              mediaAssetId,
              sortOrder: index,
            })),
          });
        }
      }

      return row;
    });

    return this.mapRow(updated);
  }

  /**
   * Publishes a draft (JOB-01, JOB-02). The Tier 2+ gate runs first — a
   * sub-Tier-2 poster gets the unlock steps, not a job. Then the draft is
   * checked for the minimum a live job needs, and moved DRAFT → OPEN.
   */
  async publish(user: AuthenticatedUser, jobId: string): Promise<JobRow> {
    await this.gate.assertCanPost(user.id);

    const job = await this.prisma.client.job.findFirst({
      where: { id: jobId, posterId: user.id },
      select: {
        ...JOB_CORE_SELECT,
        categoryId: true,
        title: true,
        description: true,
      },
    });

    if (!job) {
      throw this.notFound();
    }

    if (job.status !== JobStatus.DRAFT) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'JOB_ALREADY_PUBLISHED',
        'This job is not a draft.',
      );
    }

    const missing: Record<string, string[]> = {};
    if (!job.title || job.title.trim().length < 3) {
      missing.title = ['Give the job a clear title before posting.'];
    }
    if (!job.description || job.description.trim().length < 20) {
      missing.description = ['Describe the work so a worker can quote it.'];
    }
    if (!job.categoryId) {
      missing.categoryId = ['Choose a category so the right workers find it.'];
    }
    if (Object.keys(missing).length > 0) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'JOB_INCOMPLETE',
        'A few things are needed before this job can go live.',
        missing,
      );
    }

    const updated = await this.applyTransition(
      { id: job.id, posterId: job.posterId, status: job.status, publishedAt: null },
      JobStatus.OPEN,
      'POSTER',
      { actorId: user.id, requestId: getRequestId() },
    );

    this.events.emit(
      JOB_PUBLISHED,
      new JobPublishedEvent({
        jobId: job.id,
        posterId: user.id,
        // Non-null here: the completeness check above rejects a missing category.
        categoryId: job.categoryId as string,
        requestId: getRequestId(),
      }),
    );

    logger.info('Job published', { payload: { jobId: job.id, posterId: user.id } });
    return this.mapRow(updated);
  }

  /**
   * A party-driven lifecycle move (JOB-05). The caller names the target; this
   * resolves whether they are the poster or the hired worker and asks the state
   * machine whether that party may make the move from the current state.
   */
  async transition(
    user: AuthenticatedUser,
    jobId: string,
    to: JobStatus,
    note: string | null | undefined,
  ): Promise<JobRow> {
    const job = await this.prisma.client.job.findUnique({
      where: { id: jobId },
      select: JOB_CORE_SELECT,
    });

    if (!job) {
      throw this.notFound();
    }

    const actorRole = await this.resolveActorRole(job.id, job.posterId, user.id);
    if (actorRole === null) {
      // Not the poster and not the hired worker — this job is none of their
      // business, and a distinct 403 would confirm the job id is real.
      throw this.notFound();
    }

    if (!isTransitionAllowedFor(job.status, to, actorRole)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ILLEGAL_JOB_TRANSITION',
        `A ${job.status} job cannot move to ${to}.`,
      );
    }

    const updated = await this.applyTransition(job, to, actorRole, {
      actorId: user.id,
      note,
      requestId: getRequestId(),
    });

    return this.mapRow(updated);
  }

  /**
   * A system-driven move, for internal callers only (the quotes module moving a
   * job to QUOTED on the first quote, or to ACCEPTED when one is accepted).
   * Never reachable from the REST surface — the DTO does not accept these
   * targets, and the state machine marks them SYSTEM.
   */
  async applySystemTransition(
    jobId: string,
    to: JobStatus,
    options: SystemTransitionOptions = {},
  ): Promise<void> {
    const job = await this.prisma.client.job.findUnique({
      where: { id: jobId },
      select: JOB_CORE_SELECT,
    });

    if (!job) {
      throw this.notFound();
    }

    const rule = jobTransitionRule(job.status, to);
    if (!rule) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ILLEGAL_JOB_TRANSITION',
        `A ${job.status} job cannot move to ${to}.`,
      );
    }

    await this.applyTransition(job, to, 'SYSTEM', {
      actorId: options.actorId ?? null,
      note: options.note,
      requestId: options.requestId ?? getRequestId(),
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  /** Applies a validated transition and appends its event, atomically. */
  private async applyTransition(
    job: { id: string; posterId: string; status: JobStatus; publishedAt: Date | null },
    to: JobStatus,
    actorRole: TransitionActor,
    ctx: { actorId?: string | null; note?: string | null; requestId?: string },
  ) {
    const now = new Date();
    const terminal = isTerminal(to);

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.job.update({
        where: {
          id: job.id,
          // Optimistic guard: the move is only applied if the row is still in the
          // state we validated against, so two concurrent transitions cannot both
          // win. A lost race updates zero rows and throws below.
          status: job.status,
        },
        data: {
          status: to,
          statusUpdatedAt: now,
          ...(to === JobStatus.OPEN && !job.publishedAt ? { publishedAt: now } : {}),
          ...(terminal ? { closedAt: now } : {}),
        },
        select: JOB_ROW_SELECT,
      });

      await tx.jobStatusEvent.create({
        data: {
          jobId: job.id,
          fromStatus: job.status,
          toStatus: to,
          actorId: ctx.actorId ?? null,
          note: ctx.note ?? null,
          requestId: ctx.requestId,
        },
      });

      return row;
    });

    const workerId = await this.hiredWorkerId(job.id);
    this.events.emit(
      JOB_STATUS_CHANGED,
      new JobStatusChangedEvent({
        jobId: job.id,
        posterId: job.posterId,
        workerId,
        fromStatus: job.status,
        toStatus: to,
        requestId: ctx.requestId,
      }),
    );

    return updated;
  }

  /** POSTER if they own it, WORKER if they are the hired worker, else null. */
  private async resolveActorRole(
    jobId: string,
    posterId: string,
    userId: string,
  ): Promise<Extract<TransitionActor, 'POSTER' | 'WORKER'> | null> {
    if (userId === posterId) {
      return 'POSTER';
    }
    const workerId = await this.hiredWorkerId(jobId);
    return workerId === userId ? 'WORKER' : null;
  }

  /** The worker hired onto a job, via its booking. Null before a booking exists. */
  private async hiredWorkerId(jobId: string): Promise<string | null> {
    const booking = await this.prisma.client.booking.findFirst({
      where: { jobId },
      select: { workerId: true },
      orderBy: { createdAt: 'desc' },
    });
    return booking?.workerId ?? null;
  }

  private async requireOwnJob(jobId: string, posterId: string) {
    const job = await this.prisma.client.job.findFirst({
      where: { id: jobId, posterId },
      select: { id: true, status: true },
    });
    if (!job) {
      throw this.notFound();
    }
    return job;
  }

  private async assertCategoryUsable(categoryId: string): Promise<void> {
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
   * Verifies each photo id is the caller's own JOB_PHOTO upload. Same reasoning
   * as ProfileOwnershipService.requireOwnedMedia: an asset id in a body is
   * attacker-controlled until proven to belong to the caller and to be a kind
   * that may appear on a job, so a client cannot attach their own KYC selfie to
   * a public job post. Duplicates the check rather than importing it, to keep
   * the jobs module independent of the profiles module.
   */
  private async assertOwnedPhotos(userId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const unique = [...new Set(ids)];
    const assets = await this.prisma.client.mediaAsset.findMany({
      where: { id: { in: unique }, ownerId: userId, deletedAt: null },
      select: { id: true, kind: true },
    });
    const byId = new Map(assets.map((a) => [a.id, a.kind]));

    for (const id of unique) {
      const kind = byId.get(id);
      if (!kind) {
        throw new AppException(HttpStatus.NOT_FOUND, 'MEDIA_NOT_FOUND', 'A photo was not found.', {
          photoAssetIds: ['Upload the photo again.'],
        });
      }
      if (kind !== MediaAssetKind.JOB_PHOTO) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'MEDIA_WRONG_KIND',
          'That file cannot be used as a job photo.',
          { photoAssetIds: ['Upload it as a job photo.'] },
        );
      }
    }
    // Preserve the caller's order — it is the display order on the post.
    return unique;
  }

  /** Resolves a location's region server-side, mirroring the profile write path. */
  private async resolveLocation(
    input: {
      latitude: number;
      longitude: number;
      source?: LocationSource;
      landmark?: string | null;
    },
    locale?: string,
  ) {
    const place = await this.reverseGeocode.resolve(
      { latitude: input.latitude, longitude: input.longitude },
      locale,
    );
    return {
      latitude: input.latitude,
      longitude: input.longitude,
      locationSource: input.source ?? LocationSource.HUMAN_INPUT,
      geoRegionId: place.regionId,
      landmark: input.landmark ?? null,
      ...(place.city ? { city: place.city } : {}),
      ...(place.locality ? { area: place.locality } : {}),
    };
  }

  private clearedLocation() {
    return {
      latitude: null,
      longitude: null,
      locationSource: null,
      geoRegionId: null,
      landmark: null,
    };
  }

  private notFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'That job was not found.');
  }

  private mapRow(row: {
    id: string;
    posterId: string;
    categoryId: string | null;
    title: string | null;
    description: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    urgency: string;
    status: JobStatus;
    city: string | null;
    area: string | null;
    landmark: string | null;
    publishedAt: Date | null;
    createdAt: Date;
  }): JobRow {
    return row;
  }
}

/** Terminal target check used when deciding whether to stamp closedAt. */
function isTerminal(status: JobStatus): boolean {
  return (
    status === JobStatus.RELEASED ||
    status === JobStatus.REFUNDED ||
    status === JobStatus.CANCELLED ||
    status === JobStatus.ARCHIVED
  );
}
