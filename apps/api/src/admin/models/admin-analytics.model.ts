import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * Admin dashboard, analytics and reports (ADM-01, ADM-07), served over GraphQL
 * per the DUAL API RULE.
 *
 * Nothing here is public and nothing here is per-user: these are PLATFORM
 * aggregates, gated on `admin:access`.
 *
 * Two rules run through every type below.
 *
 * First, a metric that has not been measured is NULL, never zero. A platform
 * with no completed jobs has no average job value, and reporting one as 0 XAF
 * would put a fabricated number on a chart an operator makes decisions from.
 *
 * Second, every count is a count of ROWS THAT EXIST, never an estimate. These
 * numbers get quoted to investors and regulators; a dashboard that rounds is a
 * dashboard nobody can use as evidence.
 */

@ObjectType({
  description:
    'A headline KPI with its movement against the preceding, equal-length window (ADM-01).',
})
export class KpiView {
  @Field(() => String, { description: 'Coded key: TOTAL_USERS, VERIFIED_WORKERS, …' })
  key!: string;

  @Field(() => Float, { description: 'The current value. Whole XAF for money keys.' })
  value!: number;

  @Field(() => Float, {
    nullable: true,
    description: 'The same measure over the preceding window. NULL when there is no prior window.',
  })
  previous!: number | null;

  @Field(() => Float, {
    nullable: true,
    description:
      'Change as a fraction, e.g. 0.12 for +12%. NULL when the previous window is zero or absent — a delta against nothing is undefined, and rendering it as +100% would invent a trend.',
  })
  delta!: number | null;
}

@ObjectType({ description: 'One point on a time series (ADM-01, ADM-07).' })
export class TimePointView {
  @Field(() => String, { description: 'ISO date at the start of the bucket (UTC day).' })
  bucket!: string;

  @Field(() => Float)
  value!: number;
}

@ObjectType({ description: 'A named time series (ADM-01, ADM-07).' })
export class TimeSeriesView {
  @Field(() => String, { description: 'Coded key: USER_GROWTH, JOBS_POSTED, REVENUE, …' })
  key!: string;

  @Field(() => [TimePointView], {
    description:
      'Every bucket in the range, INCLUDING empty ones. A series that omits its zero days draws a line that skips them, which reads as continuity that did not happen.',
  })
  points!: TimePointView[];
}

@ObjectType({ description: 'One slice of a categorical breakdown (ADM-01, ADM-07).' })
export class BreakdownSliceView {
  @Field(() => ID, { nullable: true })
  id!: string | null;

  @Field(() => String, { description: 'Display label, already resolved from the id.' })
  label!: string;

  @Field(() => Float)
  value!: number;

  @Field(() => Float, { description: 'Share of the breakdown total, 0–1.' })
  share!: number;
}

@ObjectType({ description: 'Escrow money in flight, by state (ADM-01).' })
export class EscrowOverviewView {
  @Field(() => Int, { description: 'Holds that are funded and not yet settled.' })
  activeHolds!: number;

  @Field(() => Int, { description: 'Whole XAF currently held.' })
  heldAmount!: number;

  @Field(() => Int, { description: 'Whole XAF released to workers in the window.' })
  releasedAmount!: number;

  @Field(() => Int, { description: 'Whole XAF refunded to clients in the window.' })
  refundedAmount!: number;

  @Field(() => Int, { description: 'Holds frozen by an open dispute.' })
  disputedHolds!: number;
}

@ObjectType({ description: 'The disputes overview (ADM-01, ADM-05).' })
export class DisputeOverviewView {
  @Field(() => Int)
  open!: number;

  @Field(() => Int)
  underReview!: number;

  @Field(() => Int)
  resolvedInWindow!: number;

  @Field(() => Int, { description: 'Whole XAF frozen behind open disputes.' })
  frozenAmount!: number;

  @Field(() => Float, {
    nullable: true,
    description:
      'Mean hours from opening to resolution, over disputes RESOLVED in the window. NULL when none were.',
  })
  averageResolutionHours!: number | null;
}

@ObjectType({ description: 'Live SOS alerts needing attention (ADM-01, SAF-01).' })
export class SosOverviewView {
  @Field(() => Int, { description: 'Alerts still active right now.' })
  active!: number;

  @Field(() => Int)
  raisedInWindow!: number;

  @Field(() => Int)
  resolvedInWindow!: number;

  @Field(() => Date, { nullable: true, description: 'When the most recent alert was raised.' })
  lastRaisedAt!: Date | null;
}

@ObjectType({
  description:
    'System health (ADM-01). Deliberately thin: it reports what THIS service can observe about its own dependencies. Uptime and latency belong to the infrastructure monitor, and inventing them here would be a dashboard reporting on itself.',
})
export class SystemHealthView {
  @Field(() => String, { description: 'OK | DEGRADED | DOWN, derived from the checks below.' })
  status!: string;

  @Field({ description: 'The database answered a round trip.' })
  databaseUp!: boolean;

  @Field(() => Int, { nullable: true, description: 'Database round-trip time in ms.' })
  databaseLatencyMs!: number | null;

  @Field(() => Int, {
    description: 'Notification deliveries that failed in the window — the queue’s health, visible.',
  })
  failedNotifications!: number;

  @Field(() => Int, {
    description: 'Campay-backed transactions still PENDING beyond the reconciliation window.',
  })
  stalePendingTransactions!: number;
}

@ObjectType({ description: 'The admin dashboard in one round trip (ADM-01).' })
export class AdminDashboardView {
  @Field(() => Int, { description: 'The window these figures cover, in days.' })
  windowDays!: number;

  @Field(() => [KpiView], { description: 'Headline KPIs with deltas.' })
  kpis!: KpiView[];

  @Field(() => [TimeSeriesView], { description: 'Platform-performance charts.' })
  series!: TimeSeriesView[];

  @Field(() => [BreakdownSliceView], { description: 'Jobs by service category.' })
  jobsByCategory!: BreakdownSliceView[];

  @Field(() => EscrowOverviewView)
  escrow!: EscrowOverviewView;

  @Field(() => DisputeOverviewView)
  disputes!: DisputeOverviewView;

  @Field(() => SosOverviewView)
  sos!: SosOverviewView;

  @Field(() => SystemHealthView)
  health!: SystemHealthView;
}

@ObjectType({ description: 'One high-performing identity (ADM-07).' })
export class TopPerformerView {
  @Field(() => ID)
  userId!: string;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => String, { nullable: true })
  avatar!: string | null;

  @Field(() => Int)
  completedJobs!: number;

  @Field(() => Float, {
    nullable: true,
    description: 'NULL until they have been rated — not zero.',
  })
  averageRating!: number | null;

  @Field(() => Int, { description: 'Trust Score, 0–100.' })
  trustScore!: number;

  @Field(() => Int, { description: 'Whole XAF earned across released escrows.' })
  earned!: number;
}

@ObjectType({ description: 'Analytics & Reports (ADM-07).' })
export class AdminAnalyticsView {
  @Field(() => Int)
  windowDays!: number;

  @Field(() => [TimeSeriesView], {
    description: 'USER_GROWTH, JOBS_POSTED, JOBS_COMPLETED, REVENUE.',
  })
  series!: TimeSeriesView[];

  @Field(() => [BreakdownSliceView])
  jobsByCategory!: BreakdownSliceView[];

  @Field(() => [BreakdownSliceView], { description: 'Jobs by city / region.' })
  jobsByLocation!: BreakdownSliceView[];

  @Field(() => [BreakdownSliceView], {
    description: 'Platform revenue by the rail the money arrived on (MTN, Orange, card, bank).',
  })
  revenueBySource!: BreakdownSliceView[];

  @Field(() => [BreakdownSliceView], {
    description: 'Trust Score distribution in bands of ten, every band present including empty.',
  })
  trustScoreDistribution!: BreakdownSliceView[];

  @Field(() => [TopPerformerView])
  topPerformers!: TopPerformerView[];
}
