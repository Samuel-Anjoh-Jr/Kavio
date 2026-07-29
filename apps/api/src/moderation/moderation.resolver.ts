import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import { AbuseReportStatus, ReportTargetType } from '@kavio/database';
import { RequirePermissions } from '../auth/decorators/auth.decorators';
import { ModerationReadService } from './moderation-read.service';
import {
  ModerationActionView,
  ModerationQueueSummaryView,
  ReportGroupDetailView,
  ReportGroupView,
} from './models/moderation.model';

/**
 * Reporting & moderation READS (GraphQL, per the DUAL API RULE; ADM-08). Writes
 * are on ModerationController.
 *
 * Every query here is admin-only: a moderation queue exposes who reported whom,
 * which is precisely the information that enables retaliation. `admin:moderate`
 * gates the whole resolver rather than each field, because there is no part of it
 * a non-admin should reach.
 */
@Resolver()
export class ModerationResolver {
  constructor(private readonly read: ModerationReadService) {}

  @Query(() => ModerationQueueSummaryView, {
    description: 'Headline counts for the moderation workspace (ADM-08).',
  })
  @RequirePermissions('admin:moderate')
  async moderationSummary(): Promise<ModerationQueueSummaryView> {
    return this.read.summary();
  }

  @Query(() => [ReportGroupView], {
    description:
      'The moderation queue, GROUPED BY REPORTED ITEM (ADM-08) — most-reported first. Twelve reports about one photo are one row.',
  })
  @RequirePermissions('admin:moderate')
  async reportQueue(
    @Args('status', { type: () => [AbuseReportStatus], nullable: true })
    status?: AbuseReportStatus[],
    @Args('targetType', { type: () => ReportTargetType, nullable: true })
    targetType?: ReportTargetType,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<ReportGroupView[]> {
    const statuses =
      status && status.length > 0 ? status : [AbuseReportStatus.OPEN, AbuseReportStatus.REVIEWING];

    return this.read.queue(statuses, targetType ?? null, limit ?? 20, offset ?? 0);
  }

  @Query(() => ReportGroupDetailView, {
    nullable: true,
    description:
      'One case: the reported item, the accountable party, every complaint about it, and that party’s moderation history (ADM-08).',
  })
  @RequirePermissions('admin:moderate')
  async reportGroup(
    @Args('targetType', { type: () => ReportTargetType }) targetType: ReportTargetType,
    @Args('targetId', { type: () => ID }) targetId: string,
  ): Promise<ReportGroupDetailView | null> {
    return this.read.group(targetType, targetId);
  }

  @Query(() => [ModerationActionView], {
    description: "An identity's moderation record, newest first (ADM-08).",
  })
  @RequirePermissions('admin:moderate')
  async moderationHistory(
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<ModerationActionView[]> {
    return this.read.partyHistory(userId);
  }
}
