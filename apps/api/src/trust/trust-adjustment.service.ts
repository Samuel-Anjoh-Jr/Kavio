import { HttpStatus, Injectable } from '@nestjs/common';
import { TrustEventType } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { ADMIN_ADJUSTMENT_MAX_MAGNITUDE } from './trust-score.model';
import { TrustScoreService } from './trust-score.service';

const logger = createLogger('trust:adjustment');

/**
 * Admin Trust Score adjustment (P84; ADM-04, SRS FR-42).
 *
 * "Admins shall view and, in exceptional cases, adjust Trust Scores (e.g. apply a
 * fraud penalty or a Field-Verified bonus for a Founding Professional)."
 *
 * The whole difficulty of this feature is that the Trust Engine was built to
 * REFUSE a human moving a score: TrustScore is a cache, SRS §21 says the total is
 * "recomputed, never edited directly", and an UPDATE to it would not survive the
 * next recompute. So an adjustment is not an edit — it is an EVENT
 * (ADMIN_ADJUSTMENT) whose amount rides on the ledger row's own delta, replayed
 * by the point model like everything else. That preserves every property the
 * engine depends on: the score stays a pure function of the log, the change is
 * auditable by construction, and reversing it is another event rather than a
 * deletion.
 *
 * This service adds the human guardrails the model cannot express:
 *   - a REQUIRED, specific reason (an exceptional action must be explained);
 *   - a bound per event (the model clamps too, but refusing at the edge tells the
 *     admin their number was out of range rather than silently shrinking it);
 *   - a full audit row naming the admin, the subject, the amount and the reason;
 *   - a refusal to adjust a suspended identity, because fraud is a verdict and a
 *     bonus must never look like a way around it.
 */
@Injectable()
export class TrustAdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trust: TrustScoreService,
  ) {}

  /**
   * Applies an exceptional adjustment (ADM-04). `delta` is signed: negative for a
   * fraud penalty, positive for a Field-Verified bonus.
   */
  async adjust(
    admin: AuthenticatedUser,
    subjectId: string,
    delta: number,
    reason: string,
  ): Promise<{ subjectId: string; delta: number; total: number }> {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_ADJUSTMENT',
        'An adjustment must be a non-zero whole number of points.',
      );
    }

    if (Math.abs(delta) > ADMIN_ADJUSTMENT_MAX_MAGNITUDE) {
      // Refused at the edge rather than silently clamped: an admin who typed 40
      // needs to know the ceiling is 25 and decide again, not discover later that
      // only 25 landed. Two smaller adjustments, each reasoned, is the intended
      // path for a genuinely larger move.
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'ADJUSTMENT_TOO_LARGE',
        `A single adjustment cannot move a score by more than ${ADMIN_ADJUSTMENT_MAX_MAGNITUDE} points.`,
      );
    }

    const subject = await this.prisma.client.user.findUnique({
      where: { id: subjectId },
      select: { id: true, trustScore: true, status: true },
    });

    if (!subject) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'SUBJECT_NOT_FOUND',
        'We could not find that identity.',
      );
    }

    // A suspended identity's score is meaningless (TRU-08), and adjusting it —
    // in either direction — would imply the number still means something. Fraud
    // is undone by lifting the suspension, which is a moderation action, not a
    // point nudge.
    const current = await this.trust.currentResult(subjectId);
    if (current.suspended) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'SUBJECT_SUSPENDED',
        'This identity is suspended — its score cannot be adjusted.',
      );
    }

    const requestId = getRequestId();

    // The ledger append + recompute. `record` writes the ADMIN_ADJUSTMENT row
    // with this delta and replays the whole log; the returned total already
    // reflects the clamp to [0, 100].
    const result = await this.trust.record({
      subjectId,
      type: TrustEventType.ADMIN_ADJUSTMENT,
      actorId: admin.id,
      delta,
      sourceType: 'AdminAdjustment',
      metadata: { reason },
    });

    // Audited alongside money and verification events (SRS §21): an exceptional
    // manual move of the platform's core signal is exactly the action a review a
    // year later has to be able to reconstruct — who, whom, how much, why.
    await this.prisma.client.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'trust.adjusted',
        target: `User:${subjectId}`,
        requestId: requestId ?? null,
        meta: {
          delta,
          reason,
          previousScore: subject.trustScore,
          newScore: result.total,
        },
      },
    });

    logger.info('Trust score adjusted by admin', {
      result: {
        subjectId,
        adminId: admin.id,
        delta,
        previousScore: subject.trustScore,
        newScore: result.total,
      },
    });

    return { subjectId, delta, total: result.total };
  }
}
