import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DisputeFaultParty,
  DisputeResolution,
  DisputeStatus,
  EscrowState,
  MediaAssetKind,
  Prisma,
} from '@trustpro/database';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { roleHasPermission } from '../../auth/rbac/permissions';
import { AppException } from '../../lib/app-exception';
import { createLogger, getRequestId } from '../../lib/logger';
import { PrismaService } from '../../prisma/prisma.service';
import { TrustScoreService } from '../../trust/trust-score.service';
import { EscrowService } from '../escrow/escrow.service';
import {
  DISPUTE_OPENED,
  DISPUTE_RESOLVED,
  DisputeOpenedEvent,
  DisputeResolvedEvent,
} from '../events/payment.events';
import { defaultFaultParty, penalisedParty, trustEventForFault } from './dispute-fault.model';
import type { DisputeMessageDto, OpenDisputeDto, ResolveDisputeDto } from './dto/dispute.dto';

const logger = createLogger('disputes');

/**
 * Disputes (PROMPT 68; PAY-03, ADM-05).
 *
 * Opening a dispute FREEZES the escrow — the escrow machine's only exit from
 * DISPUTED is a SYSTEM (admin) move, so once frozen no party can start, complete
 * or confirm their way to a payout. Resolution is an admin action whose chosen
 * outcome drives the same machine: release to the worker, refund the client, ask
 * for more information, or close. Every step is audit-logged and emits an event
 * the Trust Engine and notifications subscribe to.
 */
@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly escrow: EscrowService,
    private readonly trust: TrustScoreService,
  ) {}

  /** A party opens a dispute over a booking, freezing its escrow (PAY-03). */
  async open(user: AuthenticatedUser, dto: OpenDisputeDto) {
    const booking = await this.prisma.client.booking.findFirst({
      where: { id: dto.bookingId, OR: [{ clientId: user.id }, { workerId: user.id }] },
      select: {
        id: true,
        jobId: true,
        clientId: true,
        workerId: true,
        escrowHold: { select: { id: true, state: true } },
      },
    });
    if (!booking) {
      throw new AppException(HttpStatus.NOT_FOUND, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }
    if (!booking.escrowHold) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'NO_ESCROW',
        'This booking has no funded escrow to dispute.',
      );
    }
    if (
      booking.escrowHold.state !== EscrowState.IN_PROGRESS &&
      booking.escrowHold.state !== EscrowState.COMPLETED
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ESCROW_NOT_DISPUTABLE',
        'A dispute can only be opened while the work is in progress or awaiting your confirmation.',
      );
    }

    await this.assertEvidenceOwned(user.id, dto.evidenceAssetIds);

    const openerRole = booking.clientId === user.id ? 'CLIENT' : 'WORKER';
    const otherPartyId = openerRole === 'CLIENT' ? booking.workerId : booking.clientId;
    const requestId = getRequestId();

    let disputeId: string;
    try {
      disputeId = await this.prisma.client.$transaction(async (tx) => {
        const dispute = await tx.dispute.create({
          data: {
            jobId: booking.jobId,
            bookingId: booking.id,
            escrowHoldId: booking.escrowHold!.id,
            openedById: user.id,
            reason: dto.reason,
            status: DisputeStatus.OPEN,
          },
          select: { id: true },
        });
        const message = await tx.disputeMessage.create({
          data: { disputeId: dispute.id, authorId: user.id, body: dto.message ?? dto.reason },
          select: { id: true },
        });
        await this.attachEvidence(tx, message.id, dto.evidenceAssetIds);
        return dispute.id;
      });
    } catch (error) {
      // The partial unique index: a booking already carries an open dispute.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          'ALREADY_DISPUTED',
          'This booking already has an open dispute.',
        );
      }
      throw error;
    }

    // Freeze the escrow (→ DISPUTED). Outside the dispute transaction, mirroring
    // BookingsService.acceptQuote: the escrow machine owns the money transition and
    // appends its own events.
    await this.escrow.freezeForDispute(booking.id, user.id, openerRole);

    await this.prisma.client.auditLog.create({
      data: {
        actorId: user.id,
        action: 'dispute.opened',
        target: `Dispute:${disputeId}`,
        requestId: requestId ?? null,
        meta: { bookingId: booking.id, jobId: booking.jobId },
      },
    });

    this.events.emit(
      DISPUTE_OPENED,
      new DisputeOpenedEvent({
        disputeId,
        bookingId: booking.id,
        jobId: booking.jobId,
        openedById: user.id,
        otherPartyId,
        requestId,
      }),
    );

    logger.info('Dispute opened; escrow frozen', {
      payload: { disputeId, bookingId: booking.id },
    });
    return { id: disputeId };
  }

  /** A party or admin adds a message + evidence to a dispute (PAY-03). */
  async addMessage(user: AuthenticatedUser, disputeId: string, dto: DisputeMessageDto) {
    const dispute = await this.loadForParticipant(user, disputeId);
    if (dispute.status === DisputeStatus.RESOLVED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'DISPUTE_RESOLVED',
        'This dispute has been resolved.',
      );
    }
    await this.assertEvidenceOwned(user.id, dto.evidenceAssetIds);

    const message = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.disputeMessage.create({
        data: { disputeId, authorId: user.id, body: dto.body ?? '' },
        select: { id: true },
      });
      await this.attachEvidence(tx, created.id, dto.evidenceAssetIds);
      return created;
    });
    return { id: message.id };
  }

  /**
   * An admin resolves a dispute (ADM-05). The resolution drives the escrow:
   *   RELEASE_TO_WORKER → escrow RELEASED (payout)
   *   REFUND_TO_CLIENT  → escrow REFUNDED
   *   REQUEST_INFO      → dispute ESCALATED, stays open, escrow stays frozen
   *   CLOSE_NO_ACTION   → resolved without moving money (only when nothing is held)
   *
   * And the FAULT FINDING drives the trust consequence (§21.5): a worker at fault
   * takes DISPUTE_UPHELD (−20), a client at fault takes DISPUTE_LOST (−10), and
   * NONE costs nobody anything. The finding is separate from the resolution — the
   * admin can override the default — because who behaved badly is not settled by
   * where the money went (see dispute-fault.model.ts).
   */
  async resolve(admin: AuthenticatedUser, disputeId: string, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.client.dispute.findUnique({
      where: { id: disputeId },
      select: {
        id: true,
        bookingId: true,
        jobId: true,
        status: true,
        booking: { select: { clientId: true, workerId: true } },
        escrowHold: { select: { state: true } },
      },
    });
    if (!dispute) {
      throw new AppException(HttpStatus.NOT_FOUND, 'DISPUTE_NOT_FOUND', 'Dispute not found.');
    }
    if (dispute.status === DisputeStatus.RESOLVED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ALREADY_RESOLVED',
        'This dispute is already resolved.',
      );
    }

    const requestId = getRequestId();

    // REQUEST_INFO is not a terminal resolution: escalate, record the ask, and
    // record NO fault — nothing is decided, so nobody is penalised yet.
    if (dto.resolution === DisputeResolution.REQUEST_INFO) {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.dispute.update({
          where: { id: disputeId },
          data: { status: DisputeStatus.ESCALATED },
        });
        if (dto.note) {
          await tx.disputeMessage.create({
            data: { disputeId, authorId: admin.id, body: dto.note },
          });
        }
      });
      await this.auditResolve(admin.id, dispute.id, dispute.bookingId, dto.resolution, requestId);
      return { id: disputeId, status: DisputeStatus.ESCALATED };
    }

    // The money-moving resolutions drive the escrow machine first.
    if (dto.resolution === DisputeResolution.RELEASE_TO_WORKER) {
      await this.escrow.resolveDispute(dispute.bookingId, EscrowState.RELEASED, admin.id, dto.note);
    } else if (dto.resolution === DisputeResolution.REFUND_TO_CLIENT) {
      await this.escrow.resolveDispute(dispute.bookingId, EscrowState.REFUNDED, admin.id, dto.note);
    } else if (dto.resolution === DisputeResolution.CLOSE_NO_ACTION) {
      // Only safe when nothing is frozen — otherwise funds would be stuck.
      if (dispute.escrowHold?.state === EscrowState.DISPUTED) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'ESCROW_STILL_FROZEN',
          'Release or refund the escrow — it cannot be left frozen on a closed dispute.',
        );
      }
    }

    // The admin's explicit finding, or the resolution's default when none given.
    const faultParty = dto.faultParty ?? defaultFaultParty(dto.resolution);

    await this.prisma.client.dispute.update({
      where: { id: disputeId },
      data: {
        status: DisputeStatus.RESOLVED,
        resolution: dto.resolution,
        resolutionNote: dto.note ?? null,
        faultParty,
        resolvedById: admin.id,
        resolvedAt: new Date(),
      },
    });

    await this.auditResolve(
      admin.id,
      dispute.id,
      dispute.bookingId,
      dto.resolution,
      requestId,
      faultParty,
    );

    // The trust consequence (§21.5). Recorded AFTER the dispute is committed and
    // only for a terminal resolution — the ledger, not this method, turns the
    // event into points, keeping the scoring rule in one place.
    await this.applyFaultPenalty(dispute, faultParty, admin.id);

    this.events.emit(
      DISPUTE_RESOLVED,
      new DisputeResolvedEvent({
        disputeId: dispute.id,
        bookingId: dispute.bookingId,
        jobId: dispute.jobId,
        clientId: dispute.booking.clientId,
        workerId: dispute.booking.workerId,
        resolution: dto.resolution,
        requestId,
      }),
    );

    logger.info('Dispute resolved', {
      payload: { disputeId, resolution: dto.resolution, faultParty },
    });
    return { id: disputeId, status: DisputeStatus.RESOLVED, faultParty };
  }

  /**
   * Records the dispute penalty against the faulted party, if any (§21.5).
   *
   * WHICH penalty depends on WHO: a worker at fault records DISPUTE_UPHELD (−20,
   * they took payment and did not deliver), a client at fault records
   * DISPUTE_LOST (−10, their complaint did not hold up and it froze a payout).
   * That mapping lives in {@link trustEventForFault} so the asymmetry is stated
   * once and testable on its own.
   *
   * No-op when fault is NONE. The penalty is a trust EVENT, so the point model
   * applies the weight and the recompute re-derives the tier; this method never
   * touches a score directly.
   */
  private async applyFaultPenalty(
    dispute: {
      id: string;
      jobId: string;
      booking: { clientId: string; workerId: string };
    },
    faultParty: DisputeFaultParty,
    adminId: string,
  ): Promise<void> {
    // Every caller of this method has already passed the REQUEST_INFO early
    // return, so the resolution is terminal and a finding of fault is real.
    const subjectId = penalisedParty(faultParty, {
      clientId: dispute.booking.clientId,
      workerId: dispute.booking.workerId,
    });
    const trustEvent = trustEventForFault(faultParty);
    if (!subjectId || !trustEvent) {
      return;
    }

    await this.trust.record({
      subjectId,
      type: trustEvent,
      actorId: adminId,
      sourceType: 'Dispute',
      sourceId: dispute.id,
      metadata: { jobId: dispute.jobId, faultParty },
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private async loadForParticipant(user: AuthenticatedUser, disputeId: string) {
    const isAdmin = roleHasPermission(user.activeRole, 'admin:dispute_resolve');
    const dispute = await this.prisma.client.dispute.findFirst({
      where: {
        id: disputeId,
        ...(isAdmin
          ? {}
          : {
              OR: [
                { openedById: user.id },
                { booking: { clientId: user.id } },
                { booking: { workerId: user.id } },
              ],
            }),
      },
      select: { id: true, status: true },
    });
    if (!dispute) {
      throw new AppException(HttpStatus.NOT_FOUND, 'DISPUTE_NOT_FOUND', 'Dispute not found.');
    }
    return dispute;
  }

  private async assertEvidenceOwned(userId: string, assetIds?: string[]): Promise<void> {
    if (!assetIds || assetIds.length === 0) return;
    const count = await this.prisma.client.mediaAsset.count({
      where: {
        id: { in: assetIds },
        ownerId: userId,
        kind: MediaAssetKind.DISPUTE_EVIDENCE,
        deletedAt: null,
      },
    });
    if (count !== assetIds.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_EVIDENCE',
        'One or more attachments are not valid dispute evidence you uploaded.',
      );
    }
  }

  private async attachEvidence(
    tx: Prisma.TransactionClient,
    disputeMessageId: string,
    assetIds?: string[],
  ): Promise<void> {
    if (!assetIds || assetIds.length === 0) return;
    await tx.disputeAttachment.createMany({
      data: assetIds.map((mediaAssetId) => ({ disputeMessageId, mediaAssetId })),
      skipDuplicates: true,
    });
  }

  private async auditResolve(
    actorId: string,
    disputeId: string,
    bookingId: string,
    resolution: DisputeResolution,
    requestId?: string,
    faultParty?: DisputeFaultParty,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        actorId,
        action: 'dispute.resolved',
        target: `Dispute:${disputeId}`,
        requestId: requestId ?? null,
        meta: { bookingId, resolution, ...(faultParty ? { faultParty } : {}) },
      },
    });
  }
}
