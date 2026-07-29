import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JobInvitationStatus, JobStatus, Prisma } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import type { InviteWorkerDto } from './dto/application.dto';
import { JOB_WORKER_INVITED, JobWorkerInvitedEvent } from './events/job.events';

const logger = createLogger('jobs.invitations');

/** How long an invitation stands before it lapses, when the poster gives no date. */
const DEFAULT_EXPIRY_DAYS = 14;

/** A poster may invite while the job is still gathering interest. */
const INVITABLE_STATUSES: readonly JobStatus[] = [JobStatus.OPEN, JobStatus.QUOTED];

export interface InvitationRow {
  id: string;
  jobId: string;
  workerId: string;
  status: JobInvitationStatus;
  message: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

const INVITATION_SELECT = {
  id: true,
  jobId: true,
  workerId: true,
  status: true,
  message: true,
  expiresAt: true,
  createdAt: true,
} as const;

/**
 * Inviting specific workers to a job (PROMPT 57; JOB-03).
 *
 * The mirror image of an application: here the client reaches out to a worker
 * they found in search. Kept in its own model and service because the direction
 * of consent matters — a worker weighing whether to quote wants to know whether
 * they came looking or were sought out.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** The poster invites a worker (JOB-03). */
  async invite(
    user: AuthenticatedUser,
    jobId: string,
    dto: InviteWorkerDto,
  ): Promise<InvitationRow> {
    const job = await this.prisma.client.job.findFirst({
      where: { id: jobId, posterId: user.id },
      select: { id: true, status: true },
    });

    if (!job) {
      throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'That job was not found.');
    }

    if (!INVITABLE_STATUSES.includes(job.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'JOB_NOT_INVITABLE',
        'You can only invite workers while the job is open.',
      );
    }

    if (dto.workerId === user.id) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CANNOT_INVITE_SELF',
        'You cannot invite yourself.',
        { workerId: ['Choose another worker.'] },
      );
    }

    // The invitee must actually be a worker: inviting a client-only account to
    // quote is a dead end that would sit unanswerable in their inbox.
    const workerProfile = await this.prisma.client.workerProfile.findUnique({
      where: { userId: dto.workerId },
      select: { userId: true },
    });

    if (!workerProfile) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'WORKER_NOT_FOUND',
        'That worker was not found.',
        { workerId: ['Choose a worker from search.'] },
      );
    }

    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    try {
      const invitation = await this.prisma.client.jobInvitation.create({
        data: {
          jobId,
          workerId: dto.workerId,
          invitedById: user.id,
          message: dto.message ?? null,
          expiresAt,
        },
        select: INVITATION_SELECT,
      });

      this.events.emit(
        JOB_WORKER_INVITED,
        new JobWorkerInvitedEvent({
          jobId,
          invitationId: invitation.id,
          workerId: dto.workerId,
          invitedById: user.id,
          requestId: getRequestId(),
        }),
      );

      logger.info('Worker invited to job', { payload: { jobId, workerId: dto.workerId } });
      return invitation;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          'ALREADY_INVITED',
          'You have already invited this worker to this job.',
        );
      }
      throw error;
    }
  }

  /** The worker accepts or declines an invitation (JOB-04). */
  async respond(
    user: AuthenticatedUser,
    invitationId: string,
    accept: boolean,
  ): Promise<InvitationRow> {
    const invitation = await this.prisma.client.jobInvitation.findFirst({
      where: { id: invitationId, workerId: user.id },
      select: { id: true, status: true, expiresAt: true },
    });

    if (!invitation) {
      throw this.invitationNotFound();
    }

    if (invitation.status !== JobInvitationStatus.PENDING) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVITATION_SETTLED',
        'This invitation has already been answered.',
      );
    }

    if (invitation.expiresAt && invitation.expiresAt.getTime() < Date.now()) {
      // Lazily expire rather than pretend it is still answerable.
      await this.prisma.client.jobInvitation.update({
        where: { id: invitationId },
        data: { status: JobInvitationStatus.EXPIRED },
      });
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVITATION_EXPIRED',
        'This invitation has expired.',
      );
    }

    return this.prisma.client.jobInvitation.update({
      where: { id: invitationId },
      data: {
        status: accept ? JobInvitationStatus.ACCEPTED : JobInvitationStatus.DECLINED,
        respondedAt: new Date(),
      },
      select: INVITATION_SELECT,
    });
  }

  /** The poster withdraws an invitation before it is answered. */
  async cancel(user: AuthenticatedUser, invitationId: string): Promise<InvitationRow> {
    const invitation = await this.prisma.client.jobInvitation.findFirst({
      where: { id: invitationId, invitedById: user.id },
      select: { id: true, status: true },
    });

    if (!invitation) {
      throw this.invitationNotFound();
    }

    if (invitation.status !== JobInvitationStatus.PENDING) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVITATION_SETTLED',
        'This invitation has already been answered.',
      );
    }

    return this.prisma.client.jobInvitation.update({
      where: { id: invitationId },
      data: { status: JobInvitationStatus.CANCELLED, respondedAt: new Date() },
      select: INVITATION_SELECT,
    });
  }

  private invitationNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      'INVITATION_NOT_FOUND',
      'That invitation was not found.',
    );
  }
}
