import type { ReportTargetType } from '@kavio/database';

/**
 * Review domain events (REV-01…REV-03). Emitted by ReviewsService; the
 * notification adapter subscribes. Services EMIT — they never call a provider —
 * per the dispatcher pattern (SRS §17).
 */

export const REVIEW_SUBMITTED = 'review.submitted';
export const REVIEW_HIDDEN = 'review.hidden';
export const REVIEW_RESTORED = 'review.restored';
export const REVIEW_REPORTED = 'review.reported';

export class ReviewSubmittedEvent {
  readonly reviewId: string;
  readonly jobId: string;
  readonly authorId: string;
  readonly subjectId: string;
  readonly rating: number;
  /** True when the rating qualified for the SRS §21.5 EXCELLENT_REVIEW points. */
  readonly excellent: boolean;
  readonly requestId?: string;

  constructor(init: {
    reviewId: string;
    jobId: string;
    authorId: string;
    subjectId: string;
    rating: number;
    excellent: boolean;
    requestId?: string;
  }) {
    this.reviewId = init.reviewId;
    this.jobId = init.jobId;
    this.authorId = init.authorId;
    this.subjectId = init.subjectId;
    this.rating = init.rating;
    this.excellent = init.excellent;
    this.requestId = init.requestId;
  }
}

/** Moderation took a review down (REV-03). Its trust contribution is revoked. */
export class ReviewHiddenEvent {
  readonly reviewId: string;
  readonly subjectId: string;
  readonly authorId: string;
  readonly moderatorId: string;
  readonly reason: string;
  readonly requestId?: string;

  constructor(init: {
    reviewId: string;
    subjectId: string;
    authorId: string;
    moderatorId: string;
    reason: string;
    requestId?: string;
  }) {
    this.reviewId = init.reviewId;
    this.subjectId = init.subjectId;
    this.authorId = init.authorId;
    this.moderatorId = init.moderatorId;
    this.reason = init.reason;
    this.requestId = init.requestId;
  }
}

/** Moderation reinstated a review it had hidden (REV-03). */
export class ReviewRestoredEvent {
  readonly reviewId: string;
  readonly subjectId: string;
  readonly authorId: string;
  readonly moderatorId: string;
  readonly requestId?: string;

  constructor(init: {
    reviewId: string;
    subjectId: string;
    authorId: string;
    moderatorId: string;
    requestId?: string;
  }) {
    this.reviewId = init.reviewId;
    this.subjectId = init.subjectId;
    this.authorId = init.authorId;
    this.moderatorId = init.moderatorId;
    this.requestId = init.requestId;
  }
}

/**
 * Someone reported a review (REV-03). Carries the generic moderation target so
 * the ADM-08 workspace can group it with every other report about the same item
 * — reviews do not get a private queue.
 */
export class ReviewReportedEvent {
  readonly reportId: string;
  readonly reviewId: string;
  readonly targetType: ReportTargetType;
  readonly reporterId: string;
  readonly reportedUserId: string;
  readonly requestId?: string;

  constructor(init: {
    reportId: string;
    reviewId: string;
    targetType: ReportTargetType;
    reporterId: string;
    reportedUserId: string;
    requestId?: string;
  }) {
    this.reportId = init.reportId;
    this.reviewId = init.reviewId;
    this.targetType = init.targetType;
    this.reporterId = init.reporterId;
    this.reportedUserId = init.reportedUserId;
    this.requestId = init.requestId;
  }
}
