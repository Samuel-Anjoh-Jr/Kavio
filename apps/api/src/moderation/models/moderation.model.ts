import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  AbuseReportReason,
  AbuseReportStatus,
  ModerationActionType,
  ReportTargetType,
  UserStatus,
} from '@kavio/database';

/**
 * Reporting & moderation READ models (ADM-08). GraphQL, per the DUAL API RULE —
 * every write is on ModerationController.
 *
 * The queue is modelled as GROUPS, not reports: the admin's unit of work is "this
 * item", and a list of individual complaints about the same photo is a list the
 * admin has to de-duplicate in their head.
 */

@ObjectType({ description: 'The identity a report or action concerns (ADM-08).' })
export class ModerationPartyView {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => String, { nullable: true })
  avatar!: string | null;

  @Field(() => UserStatus)
  status!: UserStatus;

  @Field(() => Int, { description: 'How many actions this identity already carries.' })
  priorActionCount!: number;
}

@ObjectType({ description: 'One complaint inside a group (ADM-08).' })
export class ReportView {
  @Field(() => ID)
  id!: string;

  @Field(() => AbuseReportReason)
  reason!: AbuseReportReason;

  @Field(() => String, { nullable: true })
  details!: string | null;

  @Field(() => AbuseReportStatus)
  status!: AbuseReportStatus;

  @Field(() => ModerationPartyView, { nullable: true, description: 'Who filed it.' })
  reporter!: ModerationPartyView | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({ description: 'A preview of the reported item itself (ADM-08).' })
export class ReportTargetView {
  @Field(() => ReportTargetType)
  targetType!: ReportTargetType;

  @Field(() => ID)
  targetId!: string;

  @Field(() => Boolean, {
    description: 'False once the item has been removed — the case still reads.',
  })
  exists!: boolean;

  @Field(() => String, { nullable: true })
  label!: string | null;

  @Field(() => String, { nullable: true })
  excerpt!: string | null;

  @Field(() => String, { nullable: true })
  imageUrl!: string | null;

  @Field(() => String, { nullable: true, description: 'Where to see it in context.' })
  url!: string | null;
}

@ObjectType({
  description:
    'Every report about ONE item, as one case (ADM-08). The unit the moderation queue works in.',
})
export class ReportGroupView {
  @Field(() => ReportTargetView)
  target!: ReportTargetView;

  @Field(() => ModerationPartyView, {
    nullable: true,
    description: 'The party accountable for the item.',
  })
  reportedUser!: ModerationPartyView | null;

  @Field(() => Int, { description: 'Reports in this group that are still open.' })
  openCount!: number;

  @Field(() => Int, { description: 'Reports in this group, ever.' })
  totalCount!: number;

  @Field(() => AbuseReportStatus, { description: 'The most advanced status in the group.' })
  status!: AbuseReportStatus;

  @Field(() => [AbuseReportReason], { description: 'Distinct reasons cited, most common first.' })
  reasons!: AbuseReportReason[];

  @Field(() => Date, { description: 'When this item was first reported.' })
  firstReportedAt!: Date;

  @Field(() => Date, { description: 'The newest report in the group.' })
  lastReportedAt!: Date;
}

@ObjectType({ description: 'One case opened up: the item, the party, every complaint (ADM-08).' })
export class ReportGroupDetailView {
  @Field(() => ReportGroupView)
  group!: ReportGroupView;

  @Field(() => [ReportView], { description: 'Every report about this item, newest first.' })
  reports!: ReportView[];

  @Field(() => [ModerationActionView], {
    description: "The party's moderation history — pattern beats incident.",
  })
  history!: ModerationActionView[];

  @Field(() => Boolean, {
    description: 'Whether CONTENT_REMOVED is meaningful for this kind of item.',
  })
  removable!: boolean;
}

@ObjectType({ description: 'A decision an admin took (ADM-08).' })
export class ModerationActionView {
  @Field(() => ID)
  id!: string;

  @Field(() => ModerationActionType)
  action!: ModerationActionType;

  @Field(() => String)
  reason!: string;

  @Field(() => ReportTargetType, { nullable: true })
  targetType!: ReportTargetType | null;

  @Field(() => ID, { nullable: true })
  targetId!: string | null;

  @Field(() => Date, { nullable: true, description: 'When a suspension lapses.' })
  expiresAt!: Date | null;

  @Field(() => ModerationPartyView, { nullable: true, description: 'The admin who decided.' })
  actor!: ModerationPartyView | null;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType({ description: 'Headline counts for the moderation workspace (ADM-08).' })
export class ModerationQueueSummaryView {
  @Field(() => Int, { description: 'Distinct items awaiting a decision.' })
  openGroups!: number;

  @Field(() => Int, { description: 'Open reports across all items.' })
  openReports!: number;

  @Field(() => Int, { description: 'Items an admin has picked up but not decided.' })
  reviewingGroups!: number;
}
