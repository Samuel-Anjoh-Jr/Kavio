import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  JobApplicationStatus,
  JobInvitationStatus,
  JobStatus,
  JobUrgency,
  VerificationTier,
} from '@trustpro/database';

/**
 * Job READ models (PROMPTS 55, 57). GraphQL, per the DUAL API RULE — every write
 * is on the REST controller.
 *
 * A guest may read a published job (ACC-01): browsing posted jobs is part of the
 * first-interface, so the board and a job's public detail carry no contact
 * details, only what a worker needs to decide whether to quote.
 */

@ObjectType({ description: 'A photo attached to a job post (JOB-02).' })
export class JobPhotoView {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true, description: 'Resolved public URL.' })
  url!: string | null;

  @Field(() => Int)
  sortOrder!: number;
}

@ObjectType({ description: 'One move the job made through its lifecycle (JOB-06).' })
export class JobStatusEventView {
  @Field(() => JobStatus, { nullable: true })
  fromStatus!: JobStatus | null;

  @Field(() => JobStatus)
  toStatus!: JobStatus;

  @Field(() => String, { nullable: true })
  note!: string | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({
  description:
    'A compact worker card shown to a poster on an applicant or invitation (JOB-03). Trust attaches to the identity.',
})
export class WorkerPreviewView {
  @Field(() => ID, { description: 'The worker identity.' })
  workerId!: string;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => String, { nullable: true })
  avatar!: string | null;

  @Field(() => String, { nullable: true })
  headline!: string | null;

  @Field(() => String, { nullable: true })
  city!: string | null;

  @Field(() => VerificationTier)
  tier!: VerificationTier;

  @Field(() => Int, { description: 'Trust Score 0-100.' })
  trustScore!: number;

  @Field(() => Int)
  completedJobs!: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Null until rated — NOT zero, which would read as "terrible" rather than "new".',
  })
  averageRating!: number | null;
}

@ObjectType({
  description:
    'The client-side trust card a worker reads before accepting a job request or applying to a posted job (JOB-03, JOB-04). The mirror image of WorkerPreviewView: the marketplace has to be legible in both directions, because the worker is the one who turns up, does the work and waits to be paid.',
})
export class ClientReliabilityView {
  @Field(() => ID)
  clientId!: string;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => String, { nullable: true })
  avatar!: string | null;

  @Field(() => VerificationTier)
  tier!: VerificationTier;

  @Field(() => Int, { description: 'Trust Score 0-100 (TRU-01).' })
  trustScore!: number;

  @Field(() => Int, { description: 'Jobs actually published. Drafts are excluded.' })
  jobsPosted!: number;

  @Field(() => Int, { description: 'Jobs that reached completion or payout.' })
  jobsCompleted!: number;

  @Field(() => Float, {
    nullable: true,
    description:
      'Completed ÷ posted, 0–1. Null before anything has been posted — a brand-new client must read as "new", not as "never finishes a job".',
  })
  completionRate!: number | null;

  @Field(() => Float, {
    nullable: true,
    description:
      'Mean rating workers gave this client (REV-01 lets the worker review back). Null until rated — NOT zero, which would read as "terrible" rather than "new".',
  })
  averageRating!: number | null;

  @Field(() => Int, { description: 'Reviews behind that average.' })
  ratedJobs!: number;

  @Field(() => Int, { description: 'Bookings this client cancelled before work began.' })
  cancelledBookings!: number;

  @Field(() => Int, {
    description:
      'Disputes this client raised that an admin found against them (ADM-05). The signal a worker cannot infer from anything else on the page.',
  })
  disputesLost!: number;

  @Field(() => Date, { description: 'When the identity joined.' })
  memberSince!: Date;
}

@ObjectType({ description: 'A posted job (JOB-01, JOB-02).' })
export class JobView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID, { description: 'The identity that posted.' })
  posterId!: string;

  @Field(() => String, { nullable: true })
  posterName!: string | null;

  @Field(() => ClientReliabilityView, {
    nullable: true,
    description:
      'What kind of client posted this, so a worker can judge before spending a quote on it (JOB-04). Null only if the poster identity has since been removed.',
  })
  posterReliability!: ClientReliabilityView | null;

  @Field(() => ID, { nullable: true })
  categoryId!: string | null;

  @Field(() => String, { nullable: true })
  categorySlug!: string | null;

  @Field(() => String, { nullable: true })
  categoryNameEn!: string | null;

  @Field(() => String, { nullable: true })
  categoryNameFr!: string | null;

  @Field(() => String, { nullable: true })
  title!: string | null;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => Int, { nullable: true, description: 'Minimum budget in XAF.' })
  budgetMin!: number | null;

  @Field(() => Int, { nullable: true })
  budgetMax!: number | null;

  @Field(() => JobUrgency)
  urgency!: JobUrgency;

  @Field(() => JobStatus)
  status!: JobStatus;

  @Field(() => String, { nullable: true })
  city!: string | null;

  @Field(() => String, { nullable: true })
  area!: string | null;

  @Field(() => String, { nullable: true })
  landmark!: string | null;

  @Field(() => [JobPhotoView])
  photos!: JobPhotoView[];

  @Field(() => Int, { description: 'How many workers have applied (JOB-03).' })
  applicationCount!: number;

  @Field(() => Int, { description: 'How many quotes have been received.' })
  quoteCount!: number;

  @Field(() => [JobStatusEventView], {
    description: 'The status timeline, oldest first (JOB-06). Empty for a guest viewer.',
  })
  timeline!: JobStatusEventView[];

  @Field(() => Date, { nullable: true })
  publishedAt!: Date | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({ description: 'A page of jobs from the board (JOB-04).' })
export class JobListView {
  @Field(() => [JobView])
  jobs!: JobView[];

  @Field(() => Int, { description: 'Total matches, not just this page.' })
  total!: number;

  @Field(() => Int)
  page!: number;

  @Field(() => Int)
  pageSize!: number;

  @Field({ description: 'True when another page exists.' })
  hasMore!: boolean;
}

@ObjectType({
  description: "A worker's application, as they track it (JOB-04), or as a poster reviews it.",
})
export class JobApplicationView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  jobId!: string;

  @Field(() => String, { nullable: true, description: 'The job title, for the worker’s tracker.' })
  jobTitle!: string | null;

  @Field(() => JobApplicationStatus)
  status!: JobApplicationStatus;

  @Field()
  message!: string;

  @Field(() => WorkerPreviewView, {
    nullable: true,
    description: 'The applicant card. Present on the poster’s applicant list (JOB-03).',
  })
  worker!: WorkerPreviewView | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({ description: 'An invitation to quote a job (JOB-03, JOB-04).' })
export class JobInvitationView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  jobId!: string;

  @Field(() => String, { nullable: true })
  jobTitle!: string | null;

  @Field(() => JobInvitationStatus)
  status!: JobInvitationStatus;

  @Field(() => String, { nullable: true })
  message!: string | null;

  @Field(() => WorkerPreviewView, {
    nullable: true,
    description: 'The invited worker card, for the poster’s view (JOB-03).',
  })
  worker!: WorkerPreviewView | null;

  @Field(() => ClientReliabilityView, {
    nullable: true,
    description:
      'Who is asking, for the WORKER’s view of an incoming job request (JOB-03). A worker should not have to accept a request from an identity they know nothing about.',
  })
  client!: ClientReliabilityView | null;

  @Field(() => Date, { nullable: true })
  expiresAt!: Date | null;

  @Field(() => Date)
  createdAt!: Date;
}
