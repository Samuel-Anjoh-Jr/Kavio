import { JobStatus, JobVisibility, JobUrgency, LocationSource } from '@kavio/database';
import { z } from 'zod';

/**
 * Job posting and lifecycle writes (PROMPT 55; JOB-01, JOB-02, JOB-05). REST,
 * per the DUAL API RULE. Every message is written to be READ BY A CLIENT, on a
 * phone, in the language they picked — the web layer keys EN/FR copy off the
 * error `code`, and these English strings are the fallback and the contract.
 */

/**
 * Whole-XAF budget bound. XAF has no minor unit, so it is an integer. The upper
 * bound is a typo guard, matching the services one: 100,000,000 XAF is not a
 * home-repair budget, it is a slipped finger, and it would wreck the budget
 * ranges every worker filters jobs on.
 */
const budgetAmount = z
  .number()
  .int('Enter a whole number of XAF — there are no centimes.')
  .min(0, 'A budget cannot be negative.')
  .max(100_000_000, 'That budget looks like a typo. Check the number of zeros.');

/** The location block a job carries. Same shape and rules as a profile's. */
const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  source: z.enum(LocationSource).optional(),
  landmark: z.string().trim().max(160, 'Keep the landmark under 160 characters.').nullish(),
});

/**
 * Creating a job. Everything is optional except nothing — a draft can be started
 * with a single field and filled in over the stepper (JOB-02 autosave). The
 * completeness a job needs to be PUBLISHED is enforced at publish time, not
 * here, so autosave never fights the user by rejecting a half-typed draft.
 */
export const createJobSchema = z
  .object({
    title: z.string().trim().min(1).max(140, 'Keep the title under 140 characters.').optional(),
    description: z
      .string()
      .trim()
      .max(5000, 'Keep the description under 5000 characters.')
      .optional(),
    categoryId: z.uuid('Choose a category from the list.').optional(),
    budgetMin: budgetAmount.nullish(),
    budgetMax: budgetAmount.nullish(),
    urgency: z.enum(JobUrgency).optional(),
    location: locationSchema.nullish(),
    /** Already-uploaded JOB_PHOTO assets. Upload happens on POST /uploads first. */
    photoAssetIds: z.array(z.uuid()).max(12, 'A job can carry up to 12 photos.').optional(),
    /**
     * Post on behalf of a business (BIZ-02). The server checks the caller holds
     * `business:jobs` for it — a company id in a request body authorises nothing.
     */
    businessProfileId: z.uuid().optional(),
    /**
     * Team/bulk posting (BIZ-02). Absent on an ordinary single-worker job; a
     * `teamSize` of 1 written everywhere would turn "is this a team job?" from a
     * fact into a comparison.
     */
    teamSize: z
      .number()
      .int('Enter a whole number of workers.')
      .min(2, 'A team job needs at least 2 workers — leave this out for a single worker.')
      .max(100, 'That team size looks like a typo.')
      .optional(),
    durationDays: z
      .number()
      .int('Enter a whole number of days.')
      .min(1, 'A job lasts at least a day.')
      .max(365, 'Keep the duration under a year.')
      .optional(),
  })
  .refine((v) => v.budgetMin == null || v.budgetMax == null || v.budgetMax >= v.budgetMin, {
    message: 'The maximum budget cannot be less than the minimum.',
    path: ['budgetMax'],
  })
  // A team size only means something against the company that is hiring the
  // team. Allowing one without the other would produce a job nobody's dashboard
  // owns and no access level governs.
  .refine((v) => v.teamSize == null || v.businessProfileId != null, {
    message: 'Team jobs are posted by a business.',
    path: ['teamSize'],
  });

export type CreateJobDto = z.infer<typeof createJobSchema>;

/**
 * A draft edit (JOB-07). Modelled as its own object rather than
 * `createJobSchema.partial()`
 * because the cross-field budget refinement must still run, and a `.partial()`
 * on a refined schema drops the refinement.
 */
export const patchJobSchema = z
  .object({
    title: z.string().trim().min(1).max(140).optional(),
    description: z.string().trim().max(5000).optional(),
    categoryId: z.uuid('Choose a category from the list.').optional(),
    budgetMin: budgetAmount.nullish(),
    budgetMax: budgetAmount.nullish(),
    urgency: z.enum(JobUrgency).optional(),
    location: locationSchema.nullish(),
    photoAssetIds: z.array(z.uuid()).max(12).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Change at least one field.' })
  .refine((v) => v.budgetMin == null || v.budgetMax == null || v.budgetMax >= v.budgetMin, {
    message: 'The maximum budget cannot be less than the minimum.',
    path: ['budgetMax'],
  });

export type PatchJobDto = z.infer<typeof patchJobSchema>;

/**
 * A lifecycle transition request (JOB-05). The caller names the TARGET state;
 * the service decides whether the move is legal from the current one and whether
 * this caller is the party entitled to make it. `note` is carried onto the
 * JobStatusEvent — "cancelled: client found someone else".
 *
 * Only the party-driven states are accepted from a client. DRAFT and system
 * states (QUOTED, REFUNDED) are unreachable through this endpoint by
 * construction, because the state machine marks them SYSTEM.
 */
export const transitionJobSchema = z.object({
  to: z.enum([
    JobStatus.OPEN,
    JobStatus.IN_PROGRESS,
    JobStatus.COMPLETED,
    JobStatus.RELEASED,
    JobStatus.DISPUTED,
    JobStatus.CANCELLED,
    JobStatus.ARCHIVED,
  ]),
  note: z.string().trim().max(500, 'Keep the note under 500 characters.').nullish(),
});

export type TransitionJobDto = z.infer<typeof transitionJobSchema>;

/**
 * How a draft should be published.
 *
 * DIRECT is the default because it is the safe answer: a client hiring one
 * worker they already chose never needs the board, and defaulting to PUBLIC
 * would put private engagements in front of strangers. PUBLIC is the gated,
 * fee-carrying option.
 */
export const publishJobSchema = z.object({
  visibility: z.enum([JobVisibility.DIRECT, JobVisibility.PUBLIC]).default(JobVisibility.DIRECT),
  /**
   * The one worker a DIRECT publish is for (JOB-01 anti-lure). Required from a
   * CLIENT caller — enforced server-side, not just by the UI always sending it
   * — so a client can never publish a workerless job for strangers to answer.
   */
  workerId: z.uuid().optional(),
});

export type PublishJobDto = z.infer<typeof publishJobSchema>;
