import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  PortfolioItemType,
  PortfolioSlot,
  VerificationCheckType,
  VerificationTier,
} from '@kavio/database';
import { EndorsementView } from '../../trust/models/endorsement.model';

/**
 * The public worker profile (PROMPT 46; PRO-01, PRO-02, PRO-03).
 *
 * One query returns everything the screen needs. That is the requirement, and it
 * is also the only way this screen is usable on a Douala 3G connection: the
 * profile is where a client decides whether to trust a stranger with their home,
 * and six sequential round trips is a decision made on a spinner.
 *
 * PUBLIC by design (ACC-01) — a guest opens a full profile before they have any
 * account. What is NOT here: phone number, email, exact address. Contact details
 * are the thing the login wall protects, because a public directory of tradesmen's
 * phone numbers would be scraped within a week and the workers would carry the cost.
 */

@ObjectType({
  description: 'A service a worker offers, with transparent pricing (PRO-03, PRO-05).',
})
export class WorkerServiceView {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => Int, {
    nullable: true,
    description:
      'Starting price in XAF. Whole numbers — XAF has no minor unit. Null means "ask", which is honest for genuinely variable work.',
  })
  startingPrice!: number | null;

  @Field(() => ID, { nullable: true })
  categoryId!: string | null;

  @Field(() => String, { nullable: true })
  categorySlug!: string | null;

  @Field(() => String, { nullable: true })
  categoryNameEn!: string | null;

  @Field(() => String, { nullable: true })
  categoryNameFr!: string | null;
}

@ObjectType({ description: 'One piece of portfolio evidence (PRO-02).' })
export class PortfolioItemView {
  @Field(() => ID)
  id!: string;

  @Field(() => PortfolioItemType)
  type!: PortfolioItemType;

  @Field(() => String, { nullable: true })
  caption!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Resolved media URL. Portfolio media is public, so this is a direct URL.',
  })
  url!: string | null;

  @Field(() => PortfolioSlot, {
    nullable: true,
    description: 'Which half of a before/after pair this is. Null for an ordinary item.',
  })
  slot!: PortfolioSlot | null;

  @Field(() => Int)
  sortOrder!: number;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({
  description:
    'A project grouping: a multi-shot job, or a before/after pair (PRO-02). Ungrouped items come back in a group with a null key.',
})
export class PortfolioGroupView {
  @Field(() => String, { nullable: true, description: 'Null for ungrouped items.' })
  groupKey!: string | null;

  @Field(() => String, { nullable: true })
  projectTitle!: string | null;

  @Field(() => [PortfolioItemView])
  items!: PortfolioItemView[];

  @Field({
    description:
      'True when the group holds both a BEFORE and an AFTER, so the UI can render the comparison slider rather than a plain gallery.',
  })
  isBeforeAfter!: boolean;
}

@ObjectType({ description: 'One day of the weekly availability rule (PRO-05).' })
export class AvailabilityDayView {
  @Field(() => Int, { description: '0 = Sunday … 6 = Saturday.' })
  dayOfWeek!: number;

  @Field(() => [AvailabilitySlotView], { description: 'Empty means closed that day.' })
  slots!: AvailabilitySlotView[];
}

@ObjectType({ description: 'A window of the day the worker is available.' })
export class AvailabilitySlotView {
  @Field({ description: 'Local 24-hour HH:MM. A recurring rule, never an instant.' })
  startTime!: string;

  @Field()
  endTime!: string;
}

@ObjectType({ description: 'A one-off override of the weekly rule (PRO-05).' })
export class AvailabilityExceptionView {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'YYYY-MM-DD, the worker’s local date.' })
  date!: string;

  @Field({ description: 'False = closed all day. True = open on a normally-closed day.' })
  isAvailable!: boolean;

  @Field(() => String, { nullable: true })
  startTime!: string | null;

  @Field(() => String, { nullable: true })
  endTime!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'The worker’s own words ("Fête du Travail").',
  })
  note!: string | null;
}

@ObjectType({
  description:
    'A verification the worker has actually passed (PRO-01). Only APPROVED checks appear — a pending one is not a claim.',
})
export class ProfileVerificationView {
  @Field(() => VerificationCheckType)
  checkType!: VerificationCheckType;

  @Field(() => Date, { nullable: true })
  verifiedAt!: Date | null;
}

@ObjectType({ description: 'The headline numbers under the name (PRO-01).' })
export class WorkerHeadlineStatsView {
  @Field(() => Int)
  completedJobs!: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Null until rated. NOT zero — a zero here reads as "terrible" rather than "new".',
  })
  averageRating!: number | null;

  @Field(() => Int, { description: 'Approved community endorsements (TRU-10).' })
  endorsementCount!: number;

  @Field(() => Int, { description: 'Portfolio items — the top survey-validated hiring driver.' })
  portfolioCount!: number;

  @Field(() => Int, { description: 'Passed verification checks.' })
  verifiedCheckCount!: number;

  @Field(() => Float, {
    nullable: true,
    description:
      'On-time completion percentage (PRO-01). NULL until the jobs module (Phase 4) can measure it — see onTimeScored. Never inferred.',
  })
  onTimePercentage!: number | null;

  @Field({
    description:
      'False while no completed-job data exists to measure punctuality. The UI must omit the stat rather than render a zero or a dash that reads as a bad score.',
  })
  onTimeScored!: boolean;

  @Field(() => Int, {
    nullable: true,
    description:
      'Median minutes between a client’s direct JobInvitation and this worker’s accept/decline (JOB-04). Distinct from SearchFilterRanges.responseTimeAvailable, which gates a marketplace-wide search FILTER still pending the Phase 5 messaging module — this is a per-worker stat computed today from real invitation timestamps. Null until responseTimeScored.',
  })
  respondsWithinMinutes!: number | null;

  @Field({
    description:
      'False until the worker has answered enough invitations (see MIN_INVITATIONS_FOR_RESPONSE_STAT) for the median to mean anything. The UI must omit the stat rather than show a claim built on one data point.',
  })
  responseTimeScored!: boolean;
}

@ObjectType({
  description:
    'Ratings summary (PRO-01). Sourced from the Trust Engine’s aggregates until the reviews module lands in Phase 5.',
})
export class ReviewsSummaryView {
  @Field(() => Float, { nullable: true })
  averageRating!: number | null;

  @Field(() => Int, { description: 'Completed jobs the rating is drawn from.' })
  ratedJobCount!: number;

  @Field({
    description:
      'False while individual review text cannot be listed (Phase 5). The aggregate above is real; the list is not available yet.',
  })
  reviewListAvailable!: boolean;
}

@ObjectType({ description: 'The full public worker profile (PRO-01, PRO-02, PRO-03).' })
export class WorkerProfileView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID, {
    description: 'The identity. Trust, tier and badges attach HERE, not to the role.',
  })
  userId!: string;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => String, { nullable: true })
  avatar!: string | null;

  @Field(() => String, { nullable: true, description: 'Cover image URL (PRO-01).' })
  coverUrl!: string | null;

  @Field(() => String, { nullable: true })
  headline!: string | null;

  @Field(() => String, { nullable: true })
  bio!: string | null;

  @Field(() => Int, { nullable: true })
  yearsExperience!: number | null;

  @Field(() => String, { nullable: true })
  city!: string | null;

  @Field(() => String, { nullable: true })
  area!: string | null;

  @Field(() => String, { nullable: true, description: 'The worker’s own landmark description.' })
  landmark!: string | null;

  @Field(() => VerificationTier, {
    description: 'Held on the identity, so a role switch never re-verifies.',
  })
  tier!: VerificationTier;

  @Field(() => Int, {
    description:
      'Trust Score 0-100. The animated ring reads this plus the pillar breakdown (TRU-02).',
  })
  trustScore!: number;

  @Field(() => Int, { description: 'Identity pillar contribution (§21.6).' })
  identityScore!: number;

  @Field(() => Int)
  professionalScore!: number;

  @Field(() => Int)
  marketplaceScore!: number;

  @Field(() => Int)
  financialScore!: number;

  @Field(() => WorkerHeadlineStatsView)
  stats!: WorkerHeadlineStatsView;

  @Field(() => [WorkerServiceView], {
    description: 'Active services only — transparent pricing (PRO-03).',
  })
  services!: WorkerServiceView[];

  @Field(() => [PortfolioGroupView], { description: 'Portfolio evidence, grouped (PRO-02).' })
  portfolio!: PortfolioGroupView[];

  @Field(() => [AvailabilityDayView], {
    description: 'All seven days, closed ones included (PRO-05).',
  })
  availability!: AvailabilityDayView[];

  @Field(() => [AvailabilityExceptionView], {
    description: 'Upcoming overrides only — past ones are noise.',
  })
  availabilityExceptions!: AvailabilityExceptionView[];

  @Field(() => [ProfileVerificationView], {
    description: 'Passed checks — the certifications strip (PRO-01).',
  })
  verifications!: ProfileVerificationView[];

  @Field(() => [EndorsementView], { description: 'Approved community endorsements (TRU-10).' })
  endorsements!: EndorsementView[];

  @Field(() => ReviewsSummaryView)
  reviews!: ReviewsSummaryView;

  @Field(() => Date)
  memberSince!: Date;
}
