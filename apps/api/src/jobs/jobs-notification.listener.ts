import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { JobApplicationStatus, JobStatus, QuoteStatus } from '@kavio/database';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import {
  JOB_APPLICATION_STATUS_CHANGED,
  JOB_APPLICATION_SUBMITTED,
  JOB_STATUS_CHANGED,
  JOB_WORKER_INVITED,
  JobApplicationStatusChangedEvent,
  JobApplicationSubmittedEvent,
  JobStatusChangedEvent,
  JobWorkerInvitedEvent,
} from './events/job.events';

/**
 * Turns job events into notification requests (JOB-03, JOB-04).
 *
 * The dispatcher-pattern seam again: this adapter maps a domain fact to a
 * template key and typed variables, and everything downstream — preferences,
 * channel choice, EN/FR rendering, queueing — is the dispatcher's. It reads the
 * job title (the events carry ids, not copy) and falls back to a neutral phrase
 * when a title is somehow blank, so a notification is never "" for a job.
 *
 * Only STATUS changes a worker would care about are announced: being shortlisted
 * or passed over is news; "under review" is not, and pushing it would train
 * people to ignore the ones that matter.
 */
@Injectable()
export class JobsNotificationListener {
  constructor(
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(JOB_APPLICATION_SUBMITTED)
  async onApplicationSubmitted(event: JobApplicationSubmittedEvent): Promise<void> {
    const jobTitle = await this.jobTitle(event.jobId);
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.posterId,
        templateKey: 'job.application_received',
        variables: { jobTitle },
        // No relevantRole: the poster could be acting as CLIENT or BUSINESS and
        // the job screen renders from the identity's relationship to the job,
        // not from the viewer's active role, so there is nothing to switch to.
        metadata: { jobId: event.jobId, deepLink: `/app/jobs/${event.jobId}` },
        requestId: event.requestId,
      }),
    );
  }

  @OnEvent(JOB_WORKER_INVITED)
  async onWorkerInvited(event: JobWorkerInvitedEvent): Promise<void> {
    const jobTitle = await this.jobTitle(event.jobId);
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.workerId,
        templateKey: 'job.invitation_received',
        variables: { jobTitle },
        metadata: {
          jobId: event.jobId,
          deepLink: `/app/jobs/${event.jobId}`,
          relevantRole: 'WORKER',
        },
        requestId: event.requestId,
      }),
    );
  }

  @OnEvent(JOB_APPLICATION_STATUS_CHANGED)
  async onApplicationStatusChanged(event: JobApplicationStatusChangedEvent): Promise<void> {
    // A shortlist or a pass is worth a message; a move into review is not.
    const announce =
      event.status === JobApplicationStatus.SHORTLISTED ||
      event.status === JobApplicationStatus.NOT_SELECTED;
    if (!announce) {
      return;
    }

    const jobTitle = await this.jobTitle(event.jobId);
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.workerId,
        templateKey: 'job.application_status_changed',
        variables: {
          jobTitle,
          status: event.status,
          statusLabelKey: `Jobs.applicationStatus.${event.status}`,
        },
        metadata: {
          jobId: event.jobId,
          deepLink: `/app/jobs/${event.jobId}`,
          relevantRole: 'WORKER',
        },
        requestId: event.requestId,
      }),
    );
  }

  /**
   * The poster cancelled a job before hiring anyone (JOB-05). Every worker with
   * a live quote on it — SENT or VIEWED, the offers a client could still act
   * on — hears that their offer is now moot. ACCEPTED/DECLINED/EXPIRED quotes
   * are already settled and get nothing; RELEASED/REFUNDED job states never
   * reach CANCELLED at all (see job-lifecycle.model.ts), so there is no risk
   * of double-notifying a booking that already resolved another way.
   */
  @OnEvent(JOB_STATUS_CHANGED)
  async onJobStatusChanged(event: JobStatusChangedEvent): Promise<void> {
    if (event.toStatus !== JobStatus.CANCELLED) {
      return;
    }

    const quotes = await this.prisma.client.quote.findMany({
      where: {
        jobId: event.jobId,
        status: { in: [QuoteStatus.SENT, QuoteStatus.VIEWED] },
      },
      select: { workerId: true },
    });
    if (quotes.length === 0) {
      return;
    }

    const jobTitle = await this.jobTitle(event.jobId);
    const workerIds = [...new Set(quotes.map((q) => q.workerId))];

    for (const workerId of workerIds) {
      this.events.emit(
        NOTIFICATION_REQUESTED,
        new NotificationRequestedEvent({
          userId: workerId,
          templateKey: 'job.cancelled',
          variables: { jobTitle },
          metadata: {
            jobId: event.jobId,
            deepLink: `/app/jobs/${event.jobId}`,
            relevantRole: 'WORKER',
          },
          requestId: event.requestId,
        }),
      );
    }
  }

  /** The job's title, or a neutral fallback so copy is never blank. */
  private async jobTitle(jobId: string): Promise<string> {
    const job = await this.prisma.client.job.findUnique({
      where: { id: jobId },
      select: { title: true },
    });
    return job?.title?.trim() || 'your job';
  }
}
