import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  VerificationCheckType,
  VerificationRejectionReason,
  VerificationStage,
  VerificationStatus,
  VerificationTier,
} from '@trustpro/database';

/**
 * Verification reads (TRU-06, AGT-02, AGT-03), served over GraphQL per the DUAL
 * API RULE. Submitting, approving and rejecting are all REST writes.
 *
 * Nothing here is public. A stranger may see a worker's Trust Score and tier —
 * that is the product — but not which checks they failed, how many attempts it
 * took, or what a reviewer wrote about their ID.
 */

@ObjectType({ description: 'One progressive verification check (TRU-06).' })
export class VerificationRecordView {
  @Field(() => ID)
  id!: string;

  @Field(() => VerificationCheckType)
  checkType!: VerificationCheckType;

  @Field(() => VerificationStatus)
  status!: VerificationStatus;

  @Field(() => VerificationStage, { description: 'Position in the review pipeline (AGT-03).' })
  stage!: VerificationStage;

  @Field(() => Int, { description: 'Which attempt this is, 1-based.' })
  attempt!: number;

  @Field(() => VerificationRejectionReason, {
    nullable: true,
    description: 'Coded outcome when this attempt was refused.',
  })
  rejectionReason!: VerificationRejectionReason | null;

  @Field(() => String, {
    nullable: true,
    description:
      'i18n key for the friendly, non-judgemental retry line (TRU-07), e.g. "Verification.rejection.OCR_UNREADABLE".',
  })
  rejectionKey!: string | null;

  @Field({
    description:
      'False only for confirmed forgery. Everything else can be sent again — a blurry photo is a retry, not a verdict.',
  })
  retryable!: boolean;

  @Field(() => String, {
    nullable: true,
    description: 'What a reviewer asked the subject to add (AGT-03).',
  })
  infoRequest!: string | null;

  @Field(() => Date)
  submittedAt!: Date;

  @Field(() => Date, { nullable: true })
  reviewedAt!: Date | null;
}

@ObjectType({ description: 'A submission waiting in the review queue (AGT-03).' })
export class VerificationQueueItemView {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  subjectId!: string;

  @Field(() => String, { nullable: true, description: 'The subject’s display name.' })
  subjectName!: string | null;

  @Field(() => VerificationTier, { description: 'The subject’s tier right now.' })
  subjectTier!: VerificationTier;

  @Field(() => Int, { description: 'The subject’s Trust Score right now.' })
  subjectTrustScore!: number;

  @Field(() => VerificationCheckType)
  checkType!: VerificationCheckType;

  @Field(() => VerificationStage)
  stage!: VerificationStage;

  @Field(() => Int)
  attempt!: number;

  @Field(() => ID, {
    nullable: true,
    description: 'Reviewer currently holding this item, if any.',
  })
  assignedToId!: string | null;

  @Field(() => [ID], { description: 'Documents submitted as evidence (TRU-08).' })
  documentIds!: string[];

  @Field(() => Date)
  submittedAt!: Date;

  @Field(() => Date, { description: 'When it last moved on the board.' })
  stageUpdatedAt!: Date;
}

@ObjectType({ description: 'One column of the pipeline board.' })
export class PipelineStageCountView {
  @Field(() => VerificationStage)
  stage!: VerificationStage;

  @Field(() => Int)
  count!: number;
}

@ObjectType({
  description: 'Pipeline throughput for the agent/admin dashboards (AGT-02, AGT-03).',
})
export class VerificationPipelineView {
  @Field(() => [PipelineStageCountView], {
    description: 'Every stage, including empty ones — a column that vanishes hides the process.',
  })
  stages!: PipelineStageCountView[];

  @Field(() => Int, { description: 'Submissions still awaiting a decision.' })
  pending!: number;

  @Field(() => Int, { description: 'Approved within the window.' })
  approved!: number;

  @Field(() => Int, { description: 'Rejected within the window.' })
  rejected!: number;

  @Field(() => Float, {
    nullable: true,
    description:
      'Mean minutes from submission to decision, over decided items only. Null until something has been decided.',
  })
  averageReviewMinutes!: number | null;

  @Field(() => Float, {
    nullable: true,
    description:
      'Approved ÷ decided, 0–1. Null when nothing has been decided — "we approve 0%" and "we have reviewed nothing" are different facts.',
  })
  approvalRate!: number | null;

  @Field(() => Int, { description: 'How many days the rates look back over.' })
  windowDays!: number;
}
