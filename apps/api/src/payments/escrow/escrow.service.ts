import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BookingStatus,
  EscrowState,
  Prisma,
  TransactionStatus,
  TransactionType,
} from '@trustpro/database';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { AppException } from '../../lib/app-exception';
import { createLogger, getRequestId } from '../../lib/logger';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../../jobs/jobs.service';
import { LedgerService } from '../ledger.service';
import {
  ESCROW_REFUNDED,
  ESCROW_RELEASED,
  PAYMENT_RECEIVED,
  EscrowRefundedEvent,
  EscrowReleasedEvent,
  PaymentReceivedEvent,
} from '../events/payment.events';
import {
  bookingStatusForEscrowState,
  isEscrowTransitionAllowedFor,
  jobStatusForEscrowState,
  type EscrowActor,
} from './escrow-lifecycle.model';

const logger = createLogger('escrow');

/** The shape every transition needs. Loaded once, passed to `applyTransition`. */
export interface HoldContext {
  id: string;
  bookingId: string;
  jobId: string;
  clientId: string;
  workerId: string;
  amount: number;
  feeAmount: number;
  payoutAmount: number;
  state: EscrowState;
}

const HOLD_CONTEXT_SELECT = {
  id: true,
  bookingId: true,
  clientId: true,
  workerId: true,
  amount: true,
  feeAmount: true,
  payoutAmount: true,
  state: true,
  booking: { select: { jobId: true } },
} as const;

export interface TransitionCtx {
  actorId?: string | null;
  note?: string | null;
  requestId?: string;
}

/**
 * The escrow state machine (PROMPT 64; PAY-01, PAY-02, SRS §15.1).
 *
 * This is where money changes state. Three rules hold it together:
 *
 *   1. EVERY MOVE IS VALIDATED by the pure machine in escrow-lifecycle.model.ts
 *      before a byte is written. An illegal move is a typed 409, never a silent
 *      no-op, and a party can never reach a SYSTEM-only move (refund, dispute
 *      resolution) through their own endpoint.
 *
 *   2. ONE TRANSACTION MOVES EVERYTHING. The escrow state, the mirrored booking
 *      status, the money (payout/fee/refund) and both audit rows commit together
 *      or not at all — a released hold that failed to credit the worker is not a
 *      state this code can leave the database in.
 *
 *   3. THE JOB FOLLOWS THE MONEY. The job lifecycle is driven from here via the
 *      job state machine (SYSTEM transition), so "work started / completed /
 *      released" means the same thing on the job board and in the ledger.
 *
 * The Campay COLLECTION that funds a hold is not here — it arrives confirmed via
 * the webhook, which calls `fund`. That keeps this machine about state and money
 * that the platform already holds, never about whether an operator is reachable.
 */
@Injectable()
export class EscrowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly ledger: LedgerService,
    private readonly jobs: JobsService,
  ) {}

  /**
   * Funds a booking's escrow on confirmed collection (PAY-01). Creates the hold
   * PAID and mirrors the booking to PAID — idempotent on the unique
   * `EscrowHold.bookingId`, so a webhook that fires twice creates exactly one hold.
   *
   * The funding TRANSACTION row is owned by the webhook flow (it began PENDING at
   * initiation and is settled there): this method returns the new hold id so the
   * caller can link that transaction to the hold. A no-op returns the existing id.
   */
  async fund(bookingId: string, campayReference: string, requestId?: string): Promise<string> {
    const existing = await this.prisma.client.escrowHold.findUnique({
      where: { bookingId },
      select: { id: true },
    });
    if (existing) {
      logger.info('Escrow already funded; ignoring duplicate', { payload: { bookingId } });
      return existing.id;
    }

    const booking = await this.prisma.client.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        jobId: true,
        clientId: true,
        workerId: true,
        agreedPrice: true,
        platformFeeAmount: true,
        workerPayoutAmount: true,
        status: true,
      },
    });
    if (!booking) {
      throw new AppException(HttpStatus.NOT_FOUND, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }

    let holdId: string;
    try {
      holdId = await this.prisma.client.$transaction(async (tx) => {
        const hold = await tx.escrowHold.create({
          data: {
            bookingId: booking.id,
            clientId: booking.clientId,
            workerId: booking.workerId,
            amount: booking.agreedPrice,
            feeAmount: booking.platformFeeAmount,
            payoutAmount: booking.workerPayoutAmount,
            state: EscrowState.PAID,
            campayCollectionRef: campayReference,
          },
          select: { id: true },
        });

        await tx.escrowStatusEvent.create({
          data: {
            escrowHoldId: hold.id,
            fromState: null,
            toState: EscrowState.PAID,
            actorId: null,
            note: 'Collection confirmed; funds held in escrow',
            requestId: requestId ?? null,
          },
        });

        await tx.booking.update({
          where: { id: booking.id },
          data: { status: BookingStatus.PAID, statusUpdatedAt: new Date() },
        });
        await tx.bookingStatusEvent.create({
          data: {
            bookingId: booking.id,
            fromStatus: booking.status,
            toStatus: BookingStatus.PAID,
            actorId: null,
            note: 'Escrow funded',
            requestId: requestId ?? null,
          },
        });

        return hold.id;
      });
    } catch (error) {
      // The unique bookingId lost a race with a concurrent webhook — already funded.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        logger.info('Escrow funded concurrently; ignoring', { payload: { bookingId } });
        const hold = await this.prisma.client.escrowHold.findUniqueOrThrow({
          where: { bookingId },
          select: { id: true },
        });
        return hold.id;
      }
      throw error;
    }

    await this.audit('escrow.funded', booking.id, booking.clientId, requestId, {
      amount: booking.agreedPrice,
      campayReference,
    });

    this.events.emit(
      PAYMENT_RECEIVED,
      new PaymentReceivedEvent({
        bookingId: booking.id,
        jobId: booking.jobId,
        clientId: booking.clientId,
        workerId: booking.workerId,
        amount: booking.agreedPrice,
        requestId,
      }),
    );

    logger.info('Escrow funded', { payload: { bookingId: booking.id } });
    return holdId;
  }

  // ── Party-facing transitions ─────────────────────────────────────────────────

  /** Worker acknowledges the funded booking (PAID → ACCEPTED). */
  acceptWork(user: AuthenticatedUser, bookingId: string) {
    return this.partyTransition(user, bookingId, EscrowState.ACCEPTED, 'WORKER');
  }

  /** Worker starts the work (ACCEPTED → IN_PROGRESS). */
  start(user: AuthenticatedUser, bookingId: string) {
    return this.partyTransition(user, bookingId, EscrowState.IN_PROGRESS, 'WORKER');
  }

  /** Worker marks the work done (IN_PROGRESS → COMPLETED). */
  complete(user: AuthenticatedUser, bookingId: string) {
    return this.partyTransition(user, bookingId, EscrowState.COMPLETED, 'WORKER');
  }

  /** Client confirms completion, releasing the payout (COMPLETED → RELEASED). */
  confirmCompletion(user: AuthenticatedUser, bookingId: string) {
    return this.partyTransition(user, bookingId, EscrowState.RELEASED, 'CLIENT');
  }

  /**
   * Either party cancels before work begins, refunding the client (PAID/ACCEPTED
   * → REFUNDED). A SYSTEM move made on the caller's behalf, so it is reachable
   * only from this guarded path and never by a party declaring their own refund.
   */
  async cancel(user: AuthenticatedUser, bookingId: string) {
    const hold = await this.loadPartyHold(user.id, bookingId);
    if (hold.state !== EscrowState.PAID && hold.state !== EscrowState.ACCEPTED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ESCROW_NOT_CANCELLABLE',
        'This booking can no longer be cancelled — work is already under way.',
      );
    }
    return this.applyTransition(hold, EscrowState.REFUNDED, 'SYSTEM', {
      actorId: user.id,
      note: 'Cancelled before work started',
      requestId: getRequestId(),
    });
  }

  // ── SYSTEM transitions (disputes, admin, webhooks) ──────────────────────────

  /** Freeze the escrow of a booking for a dispute (→ DISPUTED). Called by disputes. */
  async freezeForDispute(bookingId: string, actorId: string, actorRole: EscrowActor) {
    const hold = await this.loadHold(bookingId);
    return this.applyTransition(hold, EscrowState.DISPUTED, actorRole, {
      actorId,
      note: 'Escrow frozen — dispute opened',
      requestId: getRequestId(),
    });
  }

  /** Resolve a disputed escrow to RELEASED or REFUNDED (admin). Called by disputes. */
  async resolveDispute(bookingId: string, to: EscrowState, actorId: string, note?: string) {
    const hold = await this.loadHold(bookingId);
    if (hold.state !== EscrowState.DISPUTED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ESCROW_NOT_DISPUTED',
        'This escrow is not in a disputed state.',
      );
    }
    return this.applyTransition(hold, to, 'SYSTEM', {
      actorId,
      note: note ?? 'Dispute resolved',
      requestId: getRequestId(),
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private async partyTransition(
    user: AuthenticatedUser,
    bookingId: string,
    to: EscrowState,
    actorRole: 'CLIENT' | 'WORKER',
  ): Promise<HoldContext> {
    const hold = await this.loadPartyHold(user.id, bookingId);
    // Verify the caller is the party the move belongs to.
    const isRightParty =
      (actorRole === 'WORKER' && hold.workerId === user.id) ||
      (actorRole === 'CLIENT' && hold.clientId === user.id);
    if (!isRightParty) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'NOT_A_PARTY',
        'You are not a party to this booking.',
      );
    }
    return this.applyTransition(hold, to, actorRole, {
      actorId: user.id,
      note: null,
      requestId: getRequestId(),
    });
  }

  /** Loads a hold and asserts the caller is its client or worker. */
  private async loadPartyHold(userId: string, bookingId: string): Promise<HoldContext> {
    const hold = await this.loadHold(bookingId);
    if (hold.clientId !== userId && hold.workerId !== userId) {
      // Not a party: not found, never a 403 that confirms the booking exists.
      throw new AppException(HttpStatus.NOT_FOUND, 'ESCROW_NOT_FOUND', 'Booking not found.');
    }
    return hold;
  }

  private async loadHold(bookingId: string): Promise<HoldContext> {
    const hold = await this.prisma.client.escrowHold.findUnique({
      where: { bookingId },
      select: HOLD_CONTEXT_SELECT,
    });
    if (!hold) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'ESCROW_NOT_FOUND',
        'No escrow has been funded for this booking yet.',
      );
    }
    return {
      id: hold.id,
      bookingId,
      jobId: hold.booking.jobId,
      clientId: hold.clientId,
      workerId: hold.workerId,
      amount: hold.amount,
      feeAmount: hold.feeAmount,
      payoutAmount: hold.payoutAmount,
      state: hold.state,
    };
  }

  /**
   * The one place an escrow state actually changes. Validates the move, then
   * commits state + booking mirror + money + audit rows atomically, drives the
   * job lifecycle, and emits the domain event.
   */
  private async applyTransition(
    hold: HoldContext,
    to: EscrowState,
    actorRole: EscrowActor,
    ctx: TransitionCtx,
  ): Promise<HoldContext> {
    if (!isEscrowTransitionAllowedFor(hold.state, to, actorRole)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ILLEGAL_ESCROW_TRANSITION',
        `This booking cannot move from ${hold.state} to ${to}.`,
      );
    }

    const now = new Date();
    const bookingStatus = bookingStatusForEscrowState(to);
    const stamp = this.timestampFor(to);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.escrowHold.update({
        where: { id: hold.id },
        data: { state: to, ...(stamp ? { [stamp]: now } : {}) },
      });
      await tx.escrowStatusEvent.create({
        data: {
          escrowHoldId: hold.id,
          fromState: hold.state,
          toState: to,
          actorId: ctx.actorId ?? null,
          note: ctx.note ?? null,
          requestId: ctx.requestId ?? null,
        },
      });

      await tx.booking.update({
        where: { id: hold.bookingId },
        data: {
          status: bookingStatus,
          statusUpdatedAt: now,
          ...(to === EscrowState.COMPLETED ? { completedAt: now } : {}),
          ...(to === EscrowState.RELEASED ? { releasedAt: now } : {}),
        },
      });
      await tx.bookingStatusEvent.create({
        data: {
          bookingId: hold.bookingId,
          fromStatus: bookingStatusForEscrowState(hold.state),
          toStatus: bookingStatus,
          actorId: ctx.actorId ?? null,
          note: ctx.note ?? null,
          requestId: ctx.requestId ?? null,
        },
      });

      // Money moves only at the settling states.
      if (to === EscrowState.RELEASED) {
        await this.ledger.adjustBalance(tx, hold.workerId, hold.payoutAmount);
        await this.ledger.record(tx, {
          userId: hold.workerId,
          type: TransactionType.ESCROW_RELEASE,
          status: TransactionStatus.SUCCESS,
          amount: hold.payoutAmount,
          bookingId: hold.bookingId,
          escrowHoldId: hold.id,
          description: 'Escrow released to your wallet',
          settledAt: now,
        });
        // The platform fee, recorded on the worker's ledger for transparency —
        // informational, so it does not touch the wallet balance.
        if (hold.feeAmount > 0) {
          await this.ledger.record(tx, {
            userId: hold.workerId,
            type: TransactionType.FEE,
            status: TransactionStatus.SUCCESS,
            amount: hold.feeAmount,
            bookingId: hold.bookingId,
            escrowHoldId: hold.id,
            description: 'Platform service fee',
            settledAt: now,
          });
        }
      } else if (to === EscrowState.REFUNDED) {
        await this.ledger.adjustBalance(tx, hold.clientId, hold.amount);
        await this.ledger.record(tx, {
          userId: hold.clientId,
          type: TransactionType.REFUND,
          status: TransactionStatus.SUCCESS,
          amount: hold.amount,
          bookingId: hold.bookingId,
          escrowHoldId: hold.id,
          description: 'Escrow refunded to your wallet',
          settledAt: now,
        });
      }
    });

    // Drive the job lifecycle to match the money (SYSTEM transition). Outside the
    // money transaction, like BookingsService.acceptQuote — the job state machine
    // owns job transitions and appends its own event.
    const jobStatus = jobStatusForEscrowState(to);
    if (jobStatus) {
      try {
        await this.jobs.applySystemTransition(hold.jobId, jobStatus, {
          actorId: ctx.actorId ?? undefined,
          note: ctx.note ?? `Escrow ${to.toLowerCase()}`,
          requestId: ctx.requestId,
        });
      } catch (error) {
        // The money has already moved and is authoritative; a job already at the
        // target rung must not roll it back. Log for reconciliation.
        logger.warn('Job lifecycle did not follow escrow transition', {
          payload: { jobId: hold.jobId, to },
          result: String(error),
        });
      }
    }

    await this.audit(
      `escrow.${to.toLowerCase()}`,
      hold.bookingId,
      ctx.actorId ?? null,
      ctx.requestId,
      {
        from: hold.state,
        to,
      },
    );

    this.emitFor(hold, to, ctx.requestId);

    logger.info('Escrow transition', {
      payload: { bookingId: hold.bookingId, from: hold.state, to },
    });

    return { ...hold, state: to };
  }

  /** Which timestamp column a target state stamps on the hold. */
  private timestampFor(to: EscrowState): keyof Prisma.EscrowHoldUpdateInput | null {
    switch (to) {
      case EscrowState.ACCEPTED:
        return 'acceptedAt';
      case EscrowState.IN_PROGRESS:
        return 'startedAt';
      case EscrowState.COMPLETED:
        return 'completedAt';
      case EscrowState.RELEASED:
        return 'releasedAt';
      case EscrowState.REFUNDED:
        return 'refundedAt';
      case EscrowState.DISPUTED:
        return 'disputedAt';
      default:
        return null;
    }
  }

  private emitFor(hold: HoldContext, to: EscrowState, requestId?: string): void {
    if (to === EscrowState.RELEASED) {
      this.events.emit(
        ESCROW_RELEASED,
        new EscrowReleasedEvent({
          bookingId: hold.bookingId,
          jobId: hold.jobId,
          workerId: hold.workerId,
          clientId: hold.clientId,
          payoutAmount: hold.payoutAmount,
          feeAmount: hold.feeAmount,
          requestId,
        }),
      );
    } else if (to === EscrowState.REFUNDED) {
      this.events.emit(
        ESCROW_REFUNDED,
        new EscrowRefundedEvent({
          bookingId: hold.bookingId,
          jobId: hold.jobId,
          clientId: hold.clientId,
          workerId: hold.workerId,
          amount: hold.amount,
          requestId,
        }),
      );
    }
  }

  private async audit(
    action: string,
    bookingId: string,
    actorId: string | null,
    requestId: string | undefined,
    meta: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        actorId,
        action,
        target: `Booking:${bookingId}`,
        requestId: requestId ?? null,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }
}
