import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JobApplicationStatus, JobStatus, MediaAssetKind, Prisma } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import type { ApplyToJobDto, UpdateApplicationStatusDto } from './dto/application.dto';
import {
  JOB_APPLICATION_STATUS_CHANGED,
  JOB_APPLICATION_SUBMITTED,
  JobApplicationStatusChangedEvent,
  JobApplicationSubmittedEvent,
} from './events/job.events';

const logger = createLogger('jobs.applications');

/** States in which a job still accepts new applications. */
const APPLICABLE_STATUSES: readonly JobStatus[] = [JobStatus.OPEN, JobStatus.QUOTED];

export interface ApplicationRow {
  id: string;
  jobId: string;
  workerId: string;
  status: JobApplicationStatus;
  message: string;
  createdAt: Date;
}

const APPLICATION_SELECT = {
  id: true,
  jobId: true,
  workerId: true,
  status: true,
  message: true,
  createdAt: true,
} as const;

/**
 * Applications: workers raising their hand, posters triaging them (PROMPT 57;
 * JOB-03, JOB-04). Writes only — the applicant list and the worker's tracker are
 * both GraphQL reads.
 *
 * An application is interest plus a message, never a price. The priced offer is a
 * Quote, and a worker is HIRED by having their quote accepted, not by a poster
 * flipping a status — which is why HIRED is not a status this service will set.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** A worker applies to a job (JOB-04). */
  async apply(user: AuthenticatedUser, jobId: string, dto: ApplyToJobDto): Promise<ApplicationRow> {
    const job = await this.prisma.client.job.findUnique({
      where: { id: jobId },
      select: { id: true, posterId: true, status: true },
    });

    if (!job) {
      throw this.jobNotFound();
    }

    if (job.posterId === user.id) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CANNOT_APPLY_OWN_JOB',
        'You cannot apply to your own job.',
      );
    }

    if (!APPLICABLE_STATUSES.includes(job.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'JOB_NOT_ACCEPTING_APPLICATIONS',
        'This job is no longer accepting applications.',
      );
    }

    const attachmentIds = await this.assertOwnedAttachments(user.id, dto.attachmentAssetIds);

    try {
      const application = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.jobApplication.create({
          data: { jobId, workerId: user.id, message: dto.message },
          select: APPLICATION_SELECT,
        });

        if (attachmentIds.length > 0) {
          await tx.jobApplicationAttachment.createMany({
            data: attachmentIds.map((mediaAssetId) => ({
              applicationId: created.id,
              mediaAssetId,
            })),
          });
        }

        return created;
      });

      this.events.emit(
        JOB_APPLICATION_SUBMITTED,
        new JobApplicationSubmittedEvent({
          jobId,
          applicationId: application.id,
          posterId: job.posterId,
          workerId: user.id,
          requestId: getRequestId(),
        }),
      );

      logger.info('Job application submitted', { payload: { jobId, workerId: user.id } });
      return application;
    } catch (error) {
      // The unique (jobId, workerId) is the guarantee a worker applies once. A
      // second attempt is a revise, not a new shout.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          'ALREADY_APPLIED',
          'You have already applied to this job.',
        );
      }
      throw error;
    }
  }

  /** The worker updates their own application message while it is still live. */
  async withdraw(user: AuthenticatedUser, applicationId: string): Promise<ApplicationRow> {
    const application = await this.prisma.client.jobApplication.findFirst({
      where: { id: applicationId, workerId: user.id },
      select: { id: true, status: true },
    });

    if (!application) {
      throw this.applicationNotFound();
    }

    if (application.status === JobApplicationStatus.HIRED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CANNOT_WITHDRAW_HIRED',
        'You are already hired for this job. Contact the client to cancel.',
      );
    }

    const updated = await this.prisma.client.jobApplication.update({
      where: { id: applicationId },
      data: {
        status: JobApplicationStatus.WITHDRAWN,
        statusUpdatedAt: new Date(),
        withdrawnAt: new Date(),
      },
      select: APPLICATION_SELECT,
    });

    return updated;
  }

  /**
   * The poster moves an applicant through the pipeline (JOB-04). The job is
   * loaded scoped to the poster, so another client's application id is simply
   * not found.
   */
  async updateStatus(
    user: AuthenticatedUser,
    applicationId: string,
    dto: UpdateApplicationStatusDto,
  ): Promise<ApplicationRow> {
    const application = await this.prisma.client.jobApplication.findFirst({
      where: { id: applicationId, job: { posterId: user.id } },
      select: { id: true, jobId: true, workerId: true, status: true },
    });

    if (!application) {
      throw this.applicationNotFound();
    }

    if (
      application.status === JobApplicationStatus.WITHDRAWN ||
      application.status === JobApplicationStatus.HIRED
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'APPLICATION_SETTLED',
        'This application can no longer be changed.',
      );
    }

    const updated = await this.prisma.client.jobApplication.update({
      where: { id: applicationId },
      data: { status: dto.status, statusUpdatedAt: new Date() },
      select: APPLICATION_SELECT,
    });

    this.events.emit(
      JOB_APPLICATION_STATUS_CHANGED,
      new JobApplicationStatusChangedEvent({
        jobId: application.jobId,
        applicationId: application.id,
        workerId: application.workerId,
        status: dto.status,
        requestId: getRequestId(),
      }),
    );

    return updated;
  }

  /** Verifies each attachment is the worker's own JOB_APPLICATION_ATTACHMENT upload. */
  private async assertOwnedAttachments(
    userId: string,
    ids: string[] | undefined,
  ): Promise<string[]> {
    if (!ids || ids.length === 0) {
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
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'MEDIA_NOT_FOUND',
          'An attachment was not found.',
          { attachmentAssetIds: ['Upload the file again.'] },
        );
      }
      if (kind !== MediaAssetKind.JOB_APPLICATION_ATTACHMENT) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'MEDIA_WRONG_KIND',
          'That file cannot be attached to an application.',
          { attachmentAssetIds: ['Upload it as an application attachment.'] },
        );
      }
    }
    return unique;
  }

  private jobNotFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'That job was not found.');
  }

  private applicationNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      'APPLICATION_NOT_FOUND',
      'That application was not found.',
    );
  }
}
