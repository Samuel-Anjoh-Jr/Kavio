import type { JobsOptions } from 'bullmq';

/**
 * The named work queues backed by Redis/BullMQ (SRS §17, §24.1):
 *  - notifications: notification dispatch (push/email/SMS-when-enabled, OTP).
 *  - webhooks: outbound + inbound webhook retries (e.g. Campay reconciliation).
 *  - dead-letter: jobs that exhausted their retries land here for inspection
 *    and manual replay instead of being silently dropped.
 */
export const QUEUE_NAMES = {
  notifications: 'notifications',
  webhooks: 'webhooks',
  deadLetter: 'dead-letter',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Queues that carry real work and get a dead-letter safety net. */
export const WORK_QUEUES: QueueName[] = [QUEUE_NAMES.notifications, QUEUE_NAMES.webhooks];

/**
 * Default retry/backoff policy applied to every enqueued job. Exponential
 * backoff spaces out retries so a flapping provider isn't hammered; failed
 * jobs are retained (removeOnFail:false) so they can be inspected and replayed.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 1000, age: 24 * 3600 },
  removeOnFail: false,
};
