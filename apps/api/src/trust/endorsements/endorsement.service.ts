import { HttpStatus, Injectable } from '@nestjs/common';
import {
  EndorsementStatus,
  Prisma,
  Role,
  TrustEventType,
  type EndorsementRelationship,
} from '@trustpro/database';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { AppException } from '../../lib/app-exception';
import { createLogger, getRequestId } from '../../lib/logger';
import { PrismaService } from '../../prisma/prisma.service';
import { TrustScoreService } from '../trust-score.service';
import {
  ENDORSEMENT_CAP,
  ENDORSEMENT_POINTS_EACH,
  ENDORSEMENT_TAPERED_OUT_AT,
  endorsementTaper,
} from '../trust-score.model';

const logger = createLogger('trust:endorsements');

export interface CreateEndorsementInput {
  readonly subjectId: string;
  readonly relationship: EndorsementRelationship;
  readonly quote: string;
  readonly rating: number;
  /** Off-platform endorser captured by a Field Agent. Staff only. */
  readonly authorName?: string;
}

/** What the taper is doing to this identity right now (TRU-10). */
export interface EndorsementInfluence {
  readonly approvedCount: number;
  /** Points before the taper, already capped. */
  readonly cappedPoints: number;
  /** 1 at no job history, 0 once fully tapered out. */
  readonly taper: number;
  /** What endorsements are actually contributing today. */
  readonly effectivePoints: number;
  readonly cap: number;
  readonly completedJobs: number;
  /** Completed jobs at which endorsements stop contributing entirely. */
  readonly taperedOutAt: number;
}

/**
 * Community endorsements (P30; TRU-10, FR-35).
 *
 * The scoring itself lives in the point model, where the cap and the taper are
 * named constants. This service owns who may endorse whom, and under what
 * moderation — which is where the real gaming risk sits, because an endorsement
 * costs an attacker nothing to write.
 *
 * Three defences, all structural rather than heuristic:
 *   - one endorsement per author per subject (a unique constraint)
 *   - self-endorsement refused outright
 *   - an author with no account cannot endorse; a Field Agent captures those,
 *     and the agent's identity is recorded as standing behind it
 */
@Injectable()
export class EndorsementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trust: TrustScoreService,
  ) {}

  /**
   * Creates an endorsement.
   *
   * An endorsement from a signed-in author is APPROVED immediately: the author
   * is accountable, one-per-pair is enforced, and holding real people in a
   * moderation queue for a two-line compliment would mean the feature never gets
   * used. An agent-captured off-platform endorsement is approved on the agent's
   * authority. Nothing else can create one.
   */
  async create(
    input: CreateEndorsementInput,
    author: AuthenticatedUser,
  ): Promise<{ id: string; status: EndorsementStatus }> {
    if (input.subjectId === author.id) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CANNOT_ENDORSE_SELF',
        'You cannot endorse yourself.',
      );
    }

    await this.assertSubjectExists(input.subjectId);

    const isStaffCapture = Boolean(input.authorName) && isStaff(author.activeRole);

    if (input.authorName && !isStaffCapture) {
      // Otherwise anyone could mint unlimited endorsements by inventing names,
      // and the one-per-author constraint would protect nothing at all.
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'NAMED_ENDORSEMENT_IS_STAFF_ONLY',
        'Only a TrustPro agent can record an endorsement on someone else’s behalf.',
      );
    }

    try {
      const endorsement = await this.prisma.client.endorsement.create({
        data: {
          subjectId: input.subjectId,
          // A captured endorsement has no author account, which is exactly what
          // lets the unique constraint allow several of them per subject.
          authorId: isStaffCapture ? null : author.id,
          authorName: isStaffCapture ? input.authorName : null,
          relationship: input.relationship,
          quote: input.quote,
          rating: input.rating,
          status: EndorsementStatus.APPROVED,
          reviewedById: isStaffCapture ? author.id : null,
          reviewedAt: new Date(),
        },
        select: { id: true, status: true },
      });

      await this.recordEndorsementEvent(input.subjectId, endorsement.id, author.id);

      logger.info('Endorsement created', {
        result: {
          endorsementId: endorsement.id,
          subjectId: input.subjectId,
          captured: isStaffCapture,
        },
      });

      return endorsement;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          'ALREADY_ENDORSED',
          'You have already endorsed this person.',
        );
      }
      throw error;
    }
  }

  /**
   * Withdraws an endorsement (author retracting, or staff moderating).
   *
   * Appends ENDORSEMENT_REVOKED rather than deleting anything: the ledger is
   * append-only, and the honest record is that the endorsement was given and
   * then taken back — not that it never existed.
   */
  async revoke(
    endorsementId: string,
    actor: AuthenticatedUser,
    note?: string,
  ): Promise<{ id: string }> {
    const endorsement = await this.prisma.client.endorsement.findUnique({
      where: { id: endorsementId },
      select: { id: true, subjectId: true, authorId: true, status: true, revokedAt: true },
    });

    if (!endorsement) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'ENDORSEMENT_NOT_FOUND',
        'We could not find that endorsement.',
      );
    }

    const isAuthor = endorsement.authorId === actor.id;
    if (!isAuthor && !isStaff(actor.activeRole)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'CANNOT_REVOKE_ENDORSEMENT',
        'Only the person who wrote an endorsement, or a TrustPro reviewer, can withdraw it.',
      );
    }

    if (endorsement.revokedAt) {
      // Already withdrawn. Returning success keeps a double-tap harmless rather
      // than appending a second negation and over-subtracting.
      return { id: endorsement.id };
    }

    await this.prisma.client.endorsement.update({
      where: { id: endorsement.id },
      data: {
        status: EndorsementStatus.REJECTED,
        revokedAt: new Date(),
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
      },
    });

    await this.prisma.client.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'endorsement.revoked',
        target: `Endorsement:${endorsement.id}`,
        requestId: getRequestId(),
        meta: { subjectId: endorsement.subjectId, byAuthor: isAuthor },
      },
    });

    // Only cancel points that were actually granted. Revoking something that
    // never scored would push the effective count negative for the next one.
    if (endorsement.status === EndorsementStatus.APPROVED) {
      await this.trust.record({
        subjectId: endorsement.subjectId,
        type: TrustEventType.ENDORSEMENT_REVOKED,
        actorId: actor.id,
        sourceType: 'Endorsement',
        sourceId: endorsement.id,
      });
    }

    logger.info('Endorsement revoked', {
      result: { endorsementId: endorsement.id, subjectId: endorsement.subjectId },
    });

    return { id: endorsement.id };
  }

  /** Approved endorsements shown on a profile. Public — that is the point. */
  async listFor(subjectId: string, limit = 20) {
    return this.prisma.client.endorsement.findMany({
      where: { subjectId, status: EndorsementStatus.APPROVED, revokedAt: null },
      select: {
        id: true,
        relationship: true,
        quote: true,
        rating: true,
        authorName: true,
        createdAt: true,
        author: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
    });
  }

  /**
   * What endorsements are contributing today, and how the taper is shaping it
   * (TRU-10).
   *
   * Exposed deliberately: a worker whose endorsement points shrink as they
   * complete jobs deserves to see that this is the design working, not their
   * reputation eroding. An unexplained falling number is how trust in a Trust
   * Score gets lost.
   */
  async influenceFor(subjectId: string): Promise<EndorsementInfluence> {
    const [approvedCount, score] = await Promise.all([
      this.prisma.client.endorsement.count({
        where: { subjectId, status: EndorsementStatus.APPROVED, revokedAt: null },
      }),
      this.prisma.client.trustScore.findUnique({
        where: { subjectId },
        select: { completedJobs: true },
      }),
    ]);

    const completedJobs = score?.completedJobs ?? 0;
    const cappedPoints = Math.min(approvedCount * ENDORSEMENT_POINTS_EACH, ENDORSEMENT_CAP);
    const taper = endorsementTaper(completedJobs);

    return {
      approvedCount,
      cappedPoints,
      taper: Math.round(taper * 100) / 100,
      effectivePoints: Math.round(cappedPoints * taper),
      cap: ENDORSEMENT_CAP,
      completedJobs,
      taperedOutAt: ENDORSEMENT_TAPERED_OUT_AT,
    };
  }

  private async recordEndorsementEvent(
    subjectId: string,
    endorsementId: string,
    actorId: string,
  ): Promise<void> {
    await this.trust.record({
      subjectId,
      type: TrustEventType.ENDORSEMENT_RECEIVED,
      actorId,
      sourceType: 'Endorsement',
      sourceId: endorsementId,
    });
  }

  private async assertSubjectExists(subjectId: string): Promise<void> {
    const subject = await this.prisma.client.user.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });

    if (!subject) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'SUBJECT_NOT_FOUND',
        'We could not find that profile.',
      );
    }
  }
}

function isStaff(role: Role): boolean {
  return role === Role.ADMIN || role === Role.AGENT;
}
