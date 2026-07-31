import { JobApplicationStatus } from '@kavio/database';
import { z } from 'zod';

/**
 * Applications and invitations (PROMPT 57; JOB-03, JOB-04). REST writes.
 *
 * An application is a worker raising their hand with a message — NOT a price. A
 * priced offer is a Quote (PROMPT 59), a separate object with a separate
 * lifecycle. Keeping them apart is what lets a worker express interest before
 * they have seen the site, and stops an "I'm interested" from being accepted
 * into a contract.
 */

export const applyToJobSchema = z.object({
  message: z
    .string()
    .trim()
    .min(10, 'Tell the client why you’re a good fit — at least a sentence.')
    .max(2000, 'Keep your message under 2000 characters.'),
  /**
   * Already-uploaded JOB_APPLICATION_ATTACHMENT assets (JOB-04) — optional. A
   * plumber has a portfolio to browse; a night watchman or a cashier often
   * does not, and a CV or reference is the only extra evidence they can give
   * a poster deciding between applicants.
   */
  attachmentAssetIds: z.array(z.uuid()).max(5, 'Attach up to 5 files.').optional(),
});

export type ApplyToJobDto = z.infer<typeof applyToJobSchema>;

/**
 * The poster moving an applicant through the pipeline (JOB-04).
 *
 * HIRED is deliberately NOT reachable here: a worker is hired by accepting their
 * QUOTE, which creates the booking and the escrow (QTE-03). Letting a poster set
 * HIRED directly would produce a "hired" worker with no agreed price and no
 * escrow — a hire in name only. WITHDRAWN is the worker's move, not the
 * poster's, so it is excluded too.
 */
export const updateApplicationStatusSchema = z.object({
  status: z.enum([
    JobApplicationStatus.UNDER_REVIEW,
    JobApplicationStatus.SHORTLISTED,
    JobApplicationStatus.NOT_SELECTED,
  ]),
});

export type UpdateApplicationStatusDto = z.infer<typeof updateApplicationStatusSchema>;

/** Inviting a specific worker to a job (JOB-03). */
export const inviteWorkerSchema = z.object({
  workerId: z.uuid('Choose a worker to invite.'),
  message: z.string().trim().max(1000, 'Keep the invitation under 1000 characters.').nullish(),
  /** Optional expiry; the service defaults one so invitations do not linger. */
  expiresAt: z.string().datetime('Use an ISO 8601 timestamp.').nullish(),
});

export type InviteWorkerDto = z.infer<typeof inviteWorkerSchema>;
