import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  Role,
  VerificationCheckType,
  VerificationRejectionReason,
  VerificationStage,
  VerificationStatus,
} from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { TrustScoreService } from '../trust/trust-score.service';
import { IdOcrService } from './id-ocr.service';
import { CHECK_DEFINITIONS, REJECTION_POLICIES, rejectionMessageKey } from './verification.model';
import {
  VERIFICATION_APPROVED,
  VERIFICATION_REJECTED,
  VERIFICATION_SUBMITTED,
  VerificationApprovedEvent,
  VerificationRejectedEvent,
  VerificationSubmittedEvent,
} from './verification.events';

const logger = createLogger('verification');

/** What a submission returns, including the retry copy when it failed instantly. */
export interface SubmissionResult {
  readonly recordId: string;
  readonly checkType: VerificationCheckType;
  readonly status: VerificationStatus;
  readonly stage: VerificationStage;
  readonly attempt: number;
  /** i18n key for the friendly retry line, when this attempt was refused (TRU-07). */
  readonly rejectionKey: string | null;
  readonly retryable: boolean;
}

/**
 * Verification submission and settlement (P28; TRU-06, TRU-07, TRU-08).
 *
 * The one rule everything here serves: a check's OUTCOME is the only thing the
 * Trust Engine hears about, and it hears about it exactly once. Approving a
 * check records a trust event; the score and the tier follow from the ledger, so
 * nothing in this file ever computes, adjusts or even reads a score.
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trust: TrustScoreService,
    private readonly ocr: IdOcrService,
    private readonly events: EventEmitter2,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Submission
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Submits documents for a check (TRU-06).
   *
   * Self-evident checks settle immediately; judgement calls enter the review
   * pipeline. An unreadable ID is refused here and now, so no reviewer spends
   * time on a photo nobody can see and the subject learns in seconds rather than
   * days (TRU-07).
   */
  async submit(
    subject: AuthenticatedUser,
    checkType: VerificationCheckType,
    documentIds: readonly string[],
  ): Promise<SubmissionResult> {
    const definition = CHECK_DEFINITIONS[checkType];

    if (definition.staffOnly) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'CHECK_IS_STAFF_ONLY',
        'This check is completed by a TrustPro agent, not from your account.',
      );
    }

    await this.assertNoLivePendingAttempt(subject.id, checkType);
    const documents = await this.loadOwnedDocuments(subject.id, checkType, documentIds);

    const attempt = await this.nextAttemptNumber(subject.id, checkType);

    // Automated read BEFORE the row is written, so a refusal is recorded as a
    // completed rejected attempt rather than as an item that briefly sat in the
    // queue and vanished.
    const ocr =
      checkType === VerificationCheckType.ID_APPROVED
        ? await this.ocr.inspect(documents.map((document) => document.id))
        : { verdict: 'INCONCLUSIVE' as const };

    const failedOcr = ocr.verdict === 'UNREADABLE';

    const record = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.verificationRecord.create({
        data: {
          subjectId: subject.id,
          checkType,
          attempt,
          status: failedOcr
            ? VerificationStatus.REJECTED
            : definition.requiresReview
              ? VerificationStatus.PENDING
              : VerificationStatus.VERIFIED,
          stage: failedOcr
            ? VerificationStage.REJECTED
            : definition.requiresReview
              ? VerificationStage.SUBMITTED
              : VerificationStage.APPROVED,
          rejectionReason: failedOcr ? ocr.reason : null,
          reviewedAt: failedOcr || !definition.requiresReview ? new Date() : null,
          metadata:
            ocr.verdict === 'INCONCLUSIVE'
              ? undefined
              : {
                  ocr: { verdict: ocr.verdict, confidence: ocr.confidence },
                },
          documents: {
            create: documents.map((document) => ({ mediaAssetId: document.id })),
          },
          stageEvents: {
            create: {
              fromStage: null,
              toStage: failedOcr
                ? VerificationStage.REJECTED
                : definition.requiresReview
                  ? VerificationStage.SUBMITTED
                  : VerificationStage.APPROVED,
              note: failedOcr ? 'Automated document read failed' : null,
              requestId: getRequestId(),
            },
          },
        },
        select: { id: true, status: true, stage: true },
      });

      // Companion checks a submission settles by itself — asking for ID approval
      // proves the ID was submitted, and the Tier 1 gate should not wait on a
      // reviewer for a fact that is already true.
      if (!failedOcr) {
        for (const companion of definition.alsoVerifies) {
          await this.upsertAutomaticRecord(tx, subject.id, companion, created.id);
        }
      }

      return created;
    });

    // Ledger writes happen after the transaction: TrustScoreService replays the
    // whole log and writes its own snapshot, and nesting that inside this
    // transaction would hold a write lock across a recompute.
    if (!failedOcr) {
      for (const companion of definition.alsoVerifies) {
        await this.recordTrustFor(subject.id, companion, record.id, null);
      }
      if (!definition.requiresReview) {
        await this.recordTrustFor(subject.id, checkType, record.id, null);
      }
    }

    this.emitSubmissionEvents(
      subject.id,
      record.id,
      checkType,
      attempt,
      definition.requiresReview,
      failedOcr,
      ocr,
    );

    logger.info('Verification submitted', {
      result: {
        subjectId: subject.id,
        checkType,
        attempt,
        status: record.status,
        stage: record.stage,
        documentCount: documents.length,
      },
    });

    return {
      recordId: record.id,
      checkType,
      status: record.status,
      stage: record.stage,
      attempt,
      rejectionKey: failedOcr ? rejectionMessageKey(ocr.reason) : null,
      retryable: failedOcr ? REJECTION_POLICIES[ocr.reason].retryable : true,
    };
  }

  /**
   * Settles a check the system already knows the answer to — a verified phone
   * (ACC-04), or a field visit an agent has just completed (AGT-01).
   *
   * Idempotent: a check already VERIFIED is left exactly as it was, so a replayed
   * OTP event cannot pay for the same verification twice.
   */
  async recordAutomaticCheck(
    subjectId: string,
    checkType: VerificationCheckType,
    options: {
      actorId?: string | null;
      metadata?: Prisma.InputJsonValue;
      documentIds?: readonly string[];
    } = {},
  ): Promise<{ recordId: string; alreadyVerified: boolean }> {
    const existing = await this.latestRecord(subjectId, checkType);

    if (existing?.status === VerificationStatus.VERIFIED) {
      return { recordId: existing.id, alreadyVerified: true };
    }

    const record = await this.prisma.client.$transaction((tx) =>
      this.upsertAutomaticRecord(tx, subjectId, checkType, null, options),
    );

    await this.recordTrustFor(
      subjectId,
      checkType,
      record.id,
      options.actorId ?? null,
      options.metadata,
    );

    this.events.emit(
      VERIFICATION_APPROVED,
      new VerificationApprovedEvent({
        recordId: record.id,
        subjectId,
        checkType,
        reviewerId: options.actorId ?? null,
        requestId: getRequestId(),
      }),
    );

    logger.info('Verification settled automatically', {
      result: { subjectId, checkType, recordId: record.id },
    });

    return { recordId: record.id, alreadyVerified: false };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Reads used by the review side
  // ───────────────────────────────────────────────────────────────────────────

  /** The live state of one check: the newest attempt wins (TRU-06). */
  async latestRecord(subjectId: string, checkType: VerificationCheckType) {
    return this.prisma.client.verificationRecord.findFirst({
      where: { subjectId, checkType },
      select: { id: true, status: true, stage: true, attempt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Every check's newest attempt, for the subject's own verification screen. */
  async listOwn(subjectId: string) {
    const records = await this.prisma.client.verificationRecord.findMany({
      where: { subjectId },
      select: {
        id: true,
        checkType: true,
        status: true,
        stage: true,
        attempt: true,
        rejectionReason: true,
        infoRequest: true,
        infoRequestedAt: true,
        submittedAt: true,
        reviewedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Newest attempt per check type. Done in memory over one indexed query
    // rather than one query per check type — eight round-trips for a screen that
    // renders eight rows is exactly the N+1 the standards forbid.
    const latest = new Map<VerificationCheckType, (typeof records)[number]>();
    for (const record of records) {
      if (!latest.has(record.checkType)) {
        latest.set(record.checkType, record);
      }
    }

    return [...latest.values()];
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Refuses a second live attempt at the same check.
   *
   * Without this, a user tapping "submit" twice puts two identical items in the
   * agent queue and one of them will be reviewed for nothing.
   */
  private async assertNoLivePendingAttempt(
    subjectId: string,
    checkType: VerificationCheckType,
  ): Promise<void> {
    const latest = await this.latestRecord(subjectId, checkType);

    if (latest?.status === VerificationStatus.PENDING) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'VERIFICATION_ALREADY_PENDING',
        'We are already reviewing this. We will let you know as soon as it is done.',
      );
    }

    if (latest?.status === VerificationStatus.VERIFIED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'VERIFICATION_ALREADY_VERIFIED',
        'This is already verified. There is nothing more to send.',
      );
    }
  }

  /**
   * Loads the submitted documents, proving ownership and kind.
   *
   * Ownership is checked against the TOKEN: without it, a guessed id would let
   * anyone submit somebody else's approved national ID as their own, which is
   * the single most valuable thing an attacker could do to this system.
   */
  private async loadOwnedDocuments(
    ownerId: string,
    checkType: VerificationCheckType,
    documentIds: readonly string[],
  ) {
    const definition = CHECK_DEFINITIONS[checkType];

    if (documentIds.length < definition.minDocuments) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'DOCUMENTS_REQUIRED',
        definition.minDocuments === 2
          ? 'Please attach both sides of the document.'
          : 'Please attach the document for this step.',
        { documentIds: ['Add the required files and try again.'] },
      );
    }

    if (documentIds.length === 0) {
      return [];
    }

    const documents = await this.prisma.client.mediaAsset.findMany({
      where: {
        id: { in: [...documentIds] },
        ownerId,
        deletedAt: null,
        kind: { in: [...definition.documentKinds] },
      },
      select: { id: true, kind: true },
    });

    if (documents.length !== documentIds.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_DOCUMENTS',
        'Some of those files are not the right type for this step.',
        { documentIds: ['Upload the files again and retry.'] },
      );
    }

    // Both sides of an ID means two DIFFERENT sides — the same front uploaded
    // twice satisfies a naive count but not a reviewer.
    const distinctKinds = new Set(documents.map((document) => document.kind));
    if (distinctKinds.size < Math.min(definition.minDocuments, definition.documentKinds.length)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'DOCUMENT_KINDS_INCOMPLETE',
        'Please attach both sides of the document, not the same side twice.',
        { documentIds: ['One file should be the front and the other the back.'] },
      );
    }

    return documents;
  }

  private async nextAttemptNumber(
    subjectId: string,
    checkType: VerificationCheckType,
  ): Promise<number> {
    const count = await this.prisma.client.verificationRecord.count({
      where: { subjectId, checkType },
    });
    return count + 1;
  }

  /** Writes a VERIFIED record for a check that needs no human judgement. */
  private async upsertAutomaticRecord(
    tx: Prisma.TransactionClient,
    subjectId: string,
    checkType: VerificationCheckType,
    sourceRecordId: string | null,
    options: {
      actorId?: string | null;
      metadata?: Prisma.InputJsonValue;
      documentIds?: readonly string[];
    } = {},
  ) {
    const attempt = (await tx.verificationRecord.count({ where: { subjectId, checkType } })) + 1;

    return tx.verificationRecord.create({
      data: {
        subjectId,
        checkType,
        attempt,
        status: VerificationStatus.VERIFIED,
        stage: VerificationStage.APPROVED,
        reviewerId: options.actorId ?? null,
        reviewedAt: new Date(),
        metadata: options.metadata,
        ...(sourceRecordId ? { reason: `Settled by verification record ${sourceRecordId}` } : {}),
        ...(options.documentIds?.length
          ? { documents: { create: options.documentIds.map((id) => ({ mediaAssetId: id })) } }
          : {}),
        stageEvents: {
          create: {
            fromStage: null,
            toStage: VerificationStage.APPROVED,
            actorId: options.actorId ?? null,
            requestId: getRequestId(),
          },
        },
      },
      select: { id: true, status: true, stage: true },
    });
  }

  /**
   * Records what a passed check is worth (SRS §21.5), if anything.
   *
   * Checks that gate a tier without scoring return here silently — the tier is
   * the reward, and paying twice for one action would inflate the point table.
   */
  private async recordTrustFor(
    subjectId: string,
    checkType: VerificationCheckType,
    recordId: string,
    actorId: string | null,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    const trustEvent = CHECK_DEFINITIONS[checkType].trustEvent;

    if (!trustEvent) {
      // Still recompute: a newly VERIFIED check can move a tier gate even when
      // it moves no points (ID_SUBMITTED is exactly this case).
      await this.trust.recompute(subjectId);
      return;
    }

    await this.trust.record({
      subjectId,
      type: trustEvent,
      actorId,
      sourceType: 'VerificationRecord',
      sourceId: recordId,
      metadata,
    });
  }

  private emitSubmissionEvents(
    subjectId: string,
    recordId: string,
    checkType: VerificationCheckType,
    attempt: number,
    requiresReview: boolean,
    failedOcr: boolean,
    ocr: { verdict: string; reason?: VerificationRejectionReason },
  ): void {
    const requestId = getRequestId();

    if (failedOcr && ocr.reason) {
      this.events.emit(
        VERIFICATION_REJECTED,
        new VerificationRejectedEvent({
          recordId,
          subjectId,
          checkType,
          reason: ocr.reason,
          retryable: REJECTION_POLICIES[ocr.reason].retryable,
          attempt,
          requestId,
        }),
      );
      return;
    }

    this.events.emit(
      VERIFICATION_SUBMITTED,
      new VerificationSubmittedEvent({
        recordId,
        subjectId,
        checkType,
        attempt,
        stage: requiresReview ? VerificationStage.SUBMITTED : VerificationStage.APPROVED,
        requestId,
      }),
    );

    if (!requiresReview) {
      this.events.emit(
        VERIFICATION_APPROVED,
        new VerificationApprovedEvent({
          recordId,
          subjectId,
          checkType,
          reviewerId: null,
          requestId,
        }),
      );
    }
  }
}

/** Roles that may act on someone else's verification (AGT-03, ADM-03). */
export const REVIEW_ROLES: readonly Role[] = [Role.ADMIN, Role.AGENT];
