import type { JobApplicationStatus, JobStatus } from '@trustpro/database';

/**
 * Job domain events (JOB-03…JOB-06). Controllers/services EMIT these and know
 * nothing about who reacts — notifications, and later matching and analytics,
 * subscribe independently. The dispatcher pattern's seam, same as everywhere.
 */

export const JOB_PUBLISHED = 'job.published';
export const JOB_STATUS_CHANGED = 'job.status_changed';
export const JOB_APPLICATION_SUBMITTED = 'job.application_submitted';
export const JOB_APPLICATION_STATUS_CHANGED = 'job.application_status_changed';
export const JOB_WORKER_INVITED = 'job.worker_invited';

export class JobPublishedEvent {
  readonly jobId: string;
  readonly posterId: string;
  readonly categoryId: string;
  readonly requestId?: string;

  constructor(init: { jobId: string; posterId: string; categoryId: string; requestId?: string }) {
    this.jobId = init.jobId;
    this.posterId = init.posterId;
    this.categoryId = init.categoryId;
    this.requestId = init.requestId;
  }
}

export class JobStatusChangedEvent {
  readonly jobId: string;
  readonly posterId: string;
  readonly workerId: string | null;
  readonly fromStatus: JobStatus | null;
  readonly toStatus: JobStatus;
  readonly requestId?: string;

  constructor(init: {
    jobId: string;
    posterId: string;
    workerId?: string | null;
    fromStatus: JobStatus | null;
    toStatus: JobStatus;
    requestId?: string;
  }) {
    this.jobId = init.jobId;
    this.posterId = init.posterId;
    this.workerId = init.workerId ?? null;
    this.fromStatus = init.fromStatus;
    this.toStatus = init.toStatus;
    this.requestId = init.requestId;
  }
}

/** A worker applied — the poster is the one who wants to know (JOB-03). */
export class JobApplicationSubmittedEvent {
  readonly jobId: string;
  readonly applicationId: string;
  readonly posterId: string;
  readonly workerId: string;
  readonly requestId?: string;

  constructor(init: {
    jobId: string;
    applicationId: string;
    posterId: string;
    workerId: string;
    requestId?: string;
  }) {
    this.jobId = init.jobId;
    this.applicationId = init.applicationId;
    this.posterId = init.posterId;
    this.workerId = init.workerId;
    this.requestId = init.requestId;
  }
}

/** The poster moved an applicant — the worker is the one who wants to know. */
export class JobApplicationStatusChangedEvent {
  readonly jobId: string;
  readonly applicationId: string;
  readonly workerId: string;
  readonly status: JobApplicationStatus;
  readonly requestId?: string;

  constructor(init: {
    jobId: string;
    applicationId: string;
    workerId: string;
    status: JobApplicationStatus;
    requestId?: string;
  }) {
    this.jobId = init.jobId;
    this.applicationId = init.applicationId;
    this.workerId = init.workerId;
    this.status = init.status;
    this.requestId = init.requestId;
  }
}

/** A poster invited a specific worker (JOB-03). */
export class JobWorkerInvitedEvent {
  readonly jobId: string;
  readonly invitationId: string;
  readonly workerId: string;
  readonly invitedById: string;
  readonly requestId?: string;

  constructor(init: {
    jobId: string;
    invitationId: string;
    workerId: string;
    invitedById: string;
    requestId?: string;
  }) {
    this.jobId = init.jobId;
    this.invitationId = init.invitationId;
    this.workerId = init.workerId;
    this.invitedById = init.invitedById;
    this.requestId = init.requestId;
  }
}
