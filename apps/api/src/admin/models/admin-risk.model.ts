import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { UserStatus } from '@trustpro/database';

/**
 * The Fraud & Risk monitor (ADM-06), served over GraphQL per the DUAL API RULE.
 * Blocking and flagging are REST writes on the moderation surface.
 *
 * ── Why there is no stored risk score ───────────────────────────────────────
 *
 * Everything here is DERIVED at read time from facts that already exist: a
 * suspended Trust Score, disputes lost, open abuse reports, account status. No
 * table stores a risk verdict, and none should. A persisted score is a number
 * that nobody recomputes and everybody trusts — it hardens into a record about a
 * person, follows them after the behaviour behind it was explained, and is
 * eventually treated as evidence rather than as the inference it is.
 *
 * So `signals` are the FACTS, and `level` is a transparent function of them,
 * recomputed on every read and never written down. The monitor surfaces
 * candidates for a human to judge. It does not judge.
 */

@ObjectType({
  description:
    'One reason an account surfaced in the monitor (ADM-06). A coded fact with its count — never a sentence, and never an opinion.',
})
export class RiskSignalView {
  @Field(() => String, {
    description:
      'Coded: TRUST_SUSPENDED, DISPUTES_LOST, OPEN_REPORTS, MODERATION_HISTORY, ACCOUNT_SUSPENDED, LOW_TRUST, BLOCKED_BY_USERS.',
  })
  code!: string;

  @Field(() => Int, { description: 'How many times the underlying fact occurs.' })
  count!: number;
}

@ObjectType({ description: 'An account the monitor surfaced for review (ADM-06).' })
export class RiskAccountView {
  @Field(() => ID)
  userId!: string;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => String, { nullable: true })
  email!: string | null;

  @Field(() => String, { nullable: true })
  phone!: string | null;

  @Field(() => UserStatus)
  status!: UserStatus;

  @Field(() => Int, { description: 'Trust Score, 0–100. Zero while suspended.' })
  trustScore!: number;

  @Field({ description: 'The Trust Score is suspended for confirmed fraud (TRU-08).' })
  trustSuspended!: boolean;

  @Field(() => [RiskSignalView], { description: 'The facts behind the level, all of them.' })
  signals!: RiskSignalView[];

  @Field(() => String, {
    description:
      'LOW | ELEVATED | HIGH, computed live from the signals. Not stored, and not a verdict — an ordering so the worst-looking accounts reach a human first.',
  })
  level!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date, { nullable: true, description: 'When moderation last acted on them.' })
  lastActionAt!: Date | null;
}

@ObjectType({ description: 'A job the monitor surfaced for review (ADM-06).' })
export class SuspiciousJobView {
  @Field(() => ID)
  jobId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => ID)
  posterId!: string;

  @Field(() => String, { nullable: true })
  posterName!: string | null;

  @Field(() => String)
  status!: string;

  @Field(() => Int, { nullable: true, description: 'Whole XAF, top of the posted range.' })
  budgetMax!: number | null;

  @Field(() => [RiskSignalView])
  signals!: RiskSignalView[];

  @Field(() => String, { description: 'LOW | ELEVATED | HIGH.' })
  level!: string;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({
  description:
    'An account moderation has suspended or banned (ADM-06). Read from the append-only ModerationAction trail, so the reason and the actor travel with it.',
})
export class BlockedAccountView {
  @Field(() => ID)
  userId!: string;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => UserStatus)
  status!: UserStatus;

  @Field(() => String, { description: 'SUSPEND or BAN.' })
  action!: string;

  @Field(() => String, { description: 'The reason shown to the party.' })
  reason!: string;

  @Field(() => ID, { nullable: true })
  actorId!: string | null;

  @Field(() => String, { nullable: true })
  actorName!: string | null;

  @Field(() => Date, { nullable: true, description: 'When a suspension lifts. NULL for a ban.' })
  expiresAt!: Date | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({
  description:
    'One aggregated cell of the platform activity heatmap (ADM-06). PostGIS does the spatial maths; Mapbox only draws the result.',
})
export class ActivityCellView {
  @Field(() => Float, { description: 'Cell centroid latitude.' })
  latitude!: number;

  @Field(() => Float, { description: 'Cell centroid longitude.' })
  longitude!: number;

  @Field(() => Int, { description: 'Jobs posted in this cell within the window.' })
  jobCount!: number;

  @Field(() => Float, {
    description: 'Cell intensity relative to the busiest cell, 0–1. What the heat ramp reads.',
  })
  intensity!: number;
}

@ObjectType({ description: 'The Fraud & Risk monitor in one round trip (ADM-06).' })
export class AdminRiskView {
  @Field(() => Int)
  windowDays!: number;

  @Field(() => [RiskAccountView])
  highRiskAccounts!: RiskAccountView[];

  @Field(() => [SuspiciousJobView])
  suspiciousJobs!: SuspiciousJobView[];

  @Field(() => [BlockedAccountView])
  blockedAccounts!: BlockedAccountView[];

  @Field(() => Int, { description: 'Abuse reports still open across the platform.' })
  openReports!: number;
}
