import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  TrustEventType,
  VerificationCheckType,
  VerificationRejectionReason,
  VerificationStage,
  VerificationStatus,
} from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { TrustScoreService } from '../trust/trust-score.service';
import {
  CHECK_DEFINITIONS,
  canTransition,
  isTerminalStage,
  REJECTION_POLICIES,
  rejectionMessageKey,
} from './verification.model';
import {
  VERIFICATION_APPROVED,
  VERIFICATION_INFO_REQUESTED,
  VERIFICATION_REJECTED,
  VerificationApprovedEvent,
  VerificationInfoRequestedEvent,
  VerificationRejectedEvent,
} from './verification.events';

const logger = createLogger('verification:review');

/** The record shape every review action works from. */
const REVIEW_SELECT = {
  id: true,
  subjectId: true,
  checkType: true,
  status: true,
  stage: true,
  attempt: true,
  assignedToId: true,
  submittedAt: true,
} as const;

export interface ReviewResult {
  readonly recordId: string;
  readonly status: VerificationStatus;
  readonly stage: VerificationStage;
  /** i18n key for the subject-facing retry line, on a rejection (TRU-07). */
  readonly rejectionKey: string | null;
  /** True when confirmed forgery ended the account (TRU-08). */
  readonly suspended: boolean;
}

/**
 * The agent/admin review pipeline (P29; AGT-02, AGT-03, ADM-03).
 *
 * Every action here is RBAC-gated at the controller, audit-logged with the
 * acting identity and the requestId, and recorded as an append-only stage
 * transition. That combination is what makes "who approved this ID, when, and
 * how long did it take" answerable a year later — which is the actual point of a
 * verification pipeline, as opposed to a status column.
 */
@Injectable()
export class VerificationReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trust: TrustScoreService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Takes an item onto a reviewer's desk (AGT-02).
   *
   * Assignment is first-come: a second reviewer trying to claim a held item is
   * told who has it rather than silently stealing it, because two agents
   * unknowingly reviewing the same submission is how contradictory decisions get
   * made.
   */
  async claim(recordId: string, reviewer: AuthenticatedUser): Promise<ReviewResult> {
    const record = await this.load(recordId);

    if (record.assignedToId && record.assignedToId !== reviewer.id) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'VERIFICATION_ALREADY_ASSIGNED',
        'Another reviewer is already working on this submission.',
      );
    }

    if (record.stage === VerificationStage.SUBMITTED) {
      return this.moveStage(record, VerificationStage.UNDER_REVIEW, reviewer, {
        note: 'Claimed for review',
        assignTo: reviewer.id,
      });
    }

    await this.prisma.client.verificationRecord.update({
      where: { id: record.id },
      data: { assignedToId: reviewer.id },
    });

    return this.toResult(record.id, record.status, record.stage, null, false);
  }

  /** Moves an item along the board, refusing any transition the model forbids. */
  async advance(
    recordId: string,
    toStage: VerificationStage,
    reviewer: AuthenticatedUser,
    note?: string,
  ): Promise<ReviewResult> {
    const record = await this.load(recordId);

    // Approval and rejection carry consequences (trust events, suspension), so
    // they have their own methods and are not reachable as a plain stage move.
    if (toStage === VerificationStage.APPROVED || toStage === VerificationStage.REJECTED) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'USE_DECISION_ENDPOINT',
        'Use approve or reject to decide a submission.',
      );
    }

    return this.moveStage(record, toStage, reviewer, { note });
  }

  /**
   * Approves a check (ADM-03).
   *
   * The trust event is recorded AFTER the row is committed, and the score is
   * whatever the ledger then replays to — this method never touches a score or a
   * tier, which is what stops an approval from becoming a way to hand out points.
   */
  async approve(
    recordId: string,
    reviewer: AuthenticatedUser,
    note?: string,
  ): Promise<ReviewResult> {
    const record = await this.load(recordId);
    this.assertDecidable(record.stage, VerificationStage.APPROVED);

    await this.prisma.client.$transaction([
      this.prisma.client.verificationRecord.update({
        where: { id: record.id },
        data: {
          status: VerificationStatus.VERIFIED,
          stage: VerificationStage.APPROVED,
          stageUpdatedAt: new Date(),
          reviewerId: reviewer.id,
          reviewedAt: new Date(),
          assignedToId: null,
          reason: note ?? null,
          rejectionReason: null,
        },
      }),
      this.prisma.client.verificationStageEvent.create({
        data: {
          verificationRecordId: record.id,
          fromStage: record.stage,
          toStage: VerificationStage.APPROVED,
          actorId: reviewer.id,
          note: note ?? null,
          requestId: getRequestId(),
        },
      }),
      this.auditEntry(reviewer.id, 'verification.approved', record.id, {
        subjectId: record.subjectId,
        checkType: record.checkType,
      }),
    ]);

    await this.applyTrustFor(record.subjectId, record.checkType, record.id, reviewer.id);

    this.events.emit(
      VERIFICATION_APPROVED,
      new VerificationApprovedEvent({
        recordId: record.id,
        subjectId: record.subjectId,
        checkType: record.checkType,
        reviewerId: reviewer.id,
        requestId: getRequestId(),
      }),
    );

    logger.info('Verification approved', {
      result: { recordId: record.id, subjectId: record.subjectId, checkType: record.checkType },
    });

    return this.toResult(
      record.id,
      VerificationStatus.VERIFIED,
      VerificationStage.APPROVED,
      null,
      false,
    );
  }

  /**
   * Rejects a check with a coded reason (ADM-03, TRU-07, TRU-08).
   *
   * CONFIRMED_FRAUDULENT is the one reason that ends an account: it appends
   * FAKE_DOCUMENTS_CONFIRMED to the ledger, and the point model turns that into
   * a permanent suspension that overrides whatever score was accumulated.
   * Everything else is a retry, phrased as one.
   */
  async reject(
    recordId: string,
    reason: VerificationRejectionReason,
    reviewer: AuthenticatedUser,
    note?: string,
  ): Promise<ReviewResult> {
    const record = await this.load(recordId);
    this.assertDecidable(record.stage, VerificationStage.REJECTED);

    const policy = REJECTION_POLICIES[reason];

    await this.prisma.client.$transaction([
      this.prisma.client.verificationRecord.update({
        where: { id: record.id },
        data: {
          status: VerificationStatus.REJECTED,
          stage: VerificationStage.REJECTED,
          stageUpdatedAt: new Date(),
          reviewerId: reviewer.id,
          reviewedAt: new Date(),
          assignedToId: null,
          rejectionReason: reason,
          reason: note ?? null,
        },
      }),
      this.prisma.client.verificationStageEvent.create({
        data: {
          verificationRecordId: record.id,
          fromStage: record.stage,
          toStage: VerificationStage.REJECTED,
          actorId: reviewer.id,
          note: note ?? null,
          requestId: getRequestId(),
        },
      }),
      this.auditEntry(reviewer.id, 'verification.rejected', record.id, {
        subjectId: record.subjectId,
        checkType: record.checkType,
        reason,
        suspends: policy.suspends,
      }),
    ]);

    if (policy.suspends) {
      // The ledger, not this method, applies the suspension: recording the fact
      // and letting the point model decide keeps "fake documents end an account"
      // in one reviewable place (TRU-08, SRS §21.5).
      await this.trust.record({
        subjectId: record.subjectId,
        type: TrustEventType.FAKE_DOCUMENTS_CONFIRMED,
        actorId: reviewer.id,
        sourceType: 'VerificationRecord',
        sourceId: record.id,
        metadata: { checkType: record.checkType, reason },
      });
    } else {
      // A rejection can take a check away again, which can demote a tier.
      await this.trust.recompute(record.subjectId);
    }

    this.events.emit(
      VERIFICATION_REJECTED,
      new VerificationRejectedEvent({
        recordId: record.id,
        subjectId: record.subjectId,
        checkType: record.checkType,
        reason,
        retryable: policy.retryable,
        attempt: record.attempt,
        requestId: getRequestId(),
      }),
    );

    logger.info('Verification rejected', {
      result: {
        recordId: record.id,
        subjectId: record.subjectId,
        checkType: record.checkType,
        reason,
        suspended: policy.suspends,
      },
    });

    return this.toResult(
      record.id,
      VerificationStatus.REJECTED,
      VerificationStage.REJECTED,
      rejectionMessageKey(reason),
      policy.suspends,
    );
  }

  /**
   * Asks the subject for something more (AGT-03).
   *
   * The item goes back to SUBMITTED and stays PENDING rather than being rejected:
   * "we need one more photo" is not a refusal, and turning it into one would cost
   * the subject their place in the queue for no reason.
   */
  async requestMoreInfo(
    recordId: string,
    infoRequest: string,
    reviewer: AuthenticatedUser,
  ): Promise<ReviewResult> {
    const record = await this.load(recordId);

    const result = await this.moveStage(record, VerificationStage.SUBMITTED, reviewer, {
      note: infoRequest,
      extra: { infoRequest, infoRequestedAt: new Date(), assignedToId: null },
      auditAction: 'verification.info_requested',
    });

    this.events.emit(
      VERIFICATION_INFO_REQUESTED,
      new VerificationInfoRequestedEvent({
        recordId: record.id,
        subjectId: record.subjectId,
        checkType: record.checkType,
        infoRequest,
        requestId: getRequestId(),
      }),
    );

    return result;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  private async load(recordId: string) {
    const record = await this.prisma.client.verificationRecord.findUnique({
      where: { id: recordId },
      select: REVIEW_SELECT,
    });

    if (!record) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'VERIFICATION_NOT_FOUND',
        'We could not find that submission.',
      );
    }

    return record;
  }

  private assertDecidable(from: VerificationStage, to: VerificationStage): void {
    if (isTerminalStage(from)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'VERIFICATION_ALREADY_DECIDED',
        'This submission has already been decided.',
      );
    }

    if (!canTransition(from, to)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ILLEGAL_STAGE_TRANSITION',
        `A submission cannot move from ${from} to ${to}.`,
      );
    }
  }

  private async moveStage(
    record: {
      id: string;
      subjectId: string;
      checkType: VerificationCheckType;
      status: VerificationStatus;
      stage: VerificationStage;
    },
    toStage: VerificationStage,
    reviewer: AuthenticatedUser,
    options: {
      note?: string;
      assignTo?: string | null;
      extra?: Prisma.VerificationRecordUncheckedUpdateInput;
      auditAction?: string;
    } = {},
  ): Promise<ReviewResult> {
    this.assertDecidable(record.stage, toStage);

    await this.prisma.client.$transaction([
      this.prisma.client.verificationRecord.update({
        where: { id: record.id },
        data: {
          stage: toStage,
          stageUpdatedAt: new Date(),
          ...(options.assignTo !== undefined ? { assignedToId: options.assignTo } : {}),
          ...(options.extra ?? {}),
        },
      }),
      this.prisma.client.verificationStageEvent.create({
        data: {
          verificationRecordId: record.id,
          fromStage: record.stage,
          toStage,
          actorId: reviewer.id,
          note: options.note ?? null,
          requestId: getRequestId(),
        },
      }),
      this.auditEntry(reviewer.id, options.auditAction ?? 'verification.stage_changed', record.id, {
        subjectId: record.subjectId,
        checkType: record.checkType,
        fromStage: record.stage,
        toStage,
      }),
    ]);

    logger.info('Verification stage changed', {
      result: { recordId: record.id, fromStage: record.stage, toStage, reviewerId: reviewer.id },
    });

    return this.toResult(record.id, record.status, toStage, null, false);
  }

  /** Approving a check records what it is worth, or just re-derives the tier. */
  private async applyTrustFor(
    subjectId: string,
    checkType: VerificationCheckType,
    recordId: string,
    reviewerId: string,
  ): Promise<void> {
    const trustEvent = CHECK_DEFINITIONS[checkType].trustEvent;

    if (!trustEvent) {
      await this.trust.recompute(subjectId);
      return;
    }

    await this.trust.record({
      subjectId,
      type: trustEvent,
      actorId: reviewerId,
      sourceType: 'VerificationRecord',
      sourceId: recordId,
    });
  }

  /** Verification actions are audit-logged alongside money events (NFR-SEC-05). */
  private auditEntry(
    actorId: string,
    action: string,
    recordId: string,
    meta: Prisma.InputJsonValue,
  ) {
    return this.prisma.client.auditLog.create({
      data: {
        actorId,
        action,
        target: `VerificationRecord:${recordId}`,
        requestId: getRequestId(),
        meta,
      },
    });
  }

  private toResult(
    recordId: string,
    status: VerificationStatus,
    stage: VerificationStage,
    rejectionKey: string | null,
    suspended: boolean,
  ): ReviewResult {
    return { recordId, status, stage, rejectionKey, suspended };
  }
}
