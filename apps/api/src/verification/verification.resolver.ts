import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import {
  Role,
  VerificationCheckType,
  VerificationStage,
  VerificationStatus,
} from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators/auth.decorators';
import {
  REJECTION_POLICIES,
  rejectionMessageKey,
  VerificationQueueGroupEnum,
  type VerificationQueueGroup,
} from './verification.model';
import { DiscoveryStatusService } from './discovery-status.service';
import { MyDiscoveryStatusView } from './models/discovery-status.model';
import { VerificationPipelineService } from './verification-pipeline.service';
import { VerificationService } from './verification.service';
import {
  VerificationPipelineView,
  VerificationQueueItemView,
  VerificationRecordView,
} from './models/verification.model';

/**
 * Verification reads (TRU-06, AGT-02, AGT-03), GraphQL-only per the DUAL API
 * RULE.
 *
 * Nothing here is @Public(). The Trust Score and tier are public because that
 * transparency IS the product; which checks someone failed and how many attempts
 * it took are not, and a guest-browsable verification history would turn the
 * trust layer into a way to embarrass people.
 */
@Resolver()
export class VerificationResolver {
  constructor(
    private readonly verification: VerificationService,
    private readonly pipeline: VerificationPipelineService,
    private readonly discoveryStatus: DiscoveryStatusService,
  ) {}

  @Query(() => MyDiscoveryStatusView, {
    description:
      'Why the signed-in worker’s profile is or is not publicly listable (TRU-05). Drives the dashboard verification banner.',
  })
  async myDiscoveryStatus(@CurrentUser() user: AuthenticatedUser): Promise<MyDiscoveryStatusView> {
    return this.discoveryStatus.forUser(user.id);
  }

  @Query(() => [VerificationRecordView], {
    description:
      'The signed-in identity’s own checks — newest attempt per check type (TRU-06). Drives the gamified verification screen.',
  })
  async myVerifications(@CurrentUser() user: AuthenticatedUser): Promise<VerificationRecordView[]> {
    const records = await this.verification.listOwn(user.id);

    return records.map((record) => ({
      id: record.id,
      checkType: record.checkType,
      status: record.status,
      stage: record.stage,
      attempt: record.attempt,
      rejectionReason: record.rejectionReason,
      rejectionKey:
        record.status === VerificationStatus.REJECTED && record.rejectionReason
          ? rejectionMessageKey(record.rejectionReason)
          : null,
      retryable: record.rejectionReason
        ? REJECTION_POLICIES[record.rejectionReason].retryable
        : true,
      infoRequest: record.infoRequest,
      submittedAt: record.submittedAt,
      reviewedAt: record.reviewedAt,
    }));
  }

  @Roles(Role.ADMIN, Role.AGENT)
  @Query(() => VerificationPipelineView, {
    description:
      'Per-stage counts, average review time and approval rate for the review pipeline (AGT-03).',
  })
  async verificationPipeline(
    @Args('windowDays', { type: () => Int, nullable: true }) windowDays?: number,
  ): Promise<VerificationPipelineView> {
    const metrics = await this.pipeline.metrics(windowDays ?? undefined);
    return { ...metrics, stages: [...metrics.stages] };
  }

  @Roles(Role.ADMIN, Role.AGENT)
  @Query(() => [VerificationQueueItemView], {
    description:
      'One column of the review board, oldest first — the queue is worked FIFO (AGT-03). `group` is the ADM-03 tab (ALL/ID/BUSINESS/FIELD).',
  })
  async verificationQueue(
    @Args('group', { type: () => VerificationQueueGroupEnum, nullable: true })
    group?: VerificationQueueGroup,
    @Args('stage', { type: () => VerificationStage, nullable: true }) stage?: VerificationStage,
    @Args('checkType', { type: () => VerificationCheckType, nullable: true })
    checkType?: VerificationCheckType,
    @Args('assignedToId', { type: () => ID, nullable: true }) assignedToId?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<VerificationQueueItemView[]> {
    const items = await this.pipeline.queue({
      group: group ?? undefined,
      stage,
      checkType,
      assignedToId,
      limit: limit ?? undefined,
      offset: offset ?? undefined,
    });

    return items.map((item) => ({
      id: item.id,
      subjectId: item.subjectId,
      subjectName: item.subject.name,
      subjectTier: item.subject.tier,
      subjectTrustScore: item.subject.trustScore,
      checkType: item.checkType,
      stage: item.stage,
      attempt: item.attempt,
      assignedToId: item.assignedToId,
      documentIds: item.documents.map((document) => document.mediaAssetId),
      submittedAt: item.submittedAt,
      stageUpdatedAt: item.stageUpdatedAt,
    }));
  }
}
