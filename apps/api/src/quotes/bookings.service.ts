import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingStatus, JobStatus, Prisma, QuoteStatus } from '@kavio/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { computeFeeSplit } from './booking-fee.model';
import {
  ESCROW_INITIATION_REQUESTED,
  QUOTE_ACCEPTED,
  EscrowInitiationRequestedEvent,
  QuoteAcceptedEvent,
} from './events/quote.events';

const logger = createLogger('bookings');

export interface BookingRow {
  id: string;
  jobId: string;
  quoteId: string;
  workerId: string;
  clientId: string;
  agreedPrice: number;
  platformFeeAmount: number;
  workerPayoutAmount: number;
  status: BookingStatus;
  createdAt: Date;
}

const BOOKING_SELECT = {
  id: true,
  jobId: true,
  quoteId: true,
  workerId: true,
  clientId: true,
  agreedPrice: true,
  platformFeeAmount: true,
  workerPayoutAmount: true,
  status: true,
  createdAt: true,
} as const;

/**
 * Bookings: accepting a quote turns it into an agreement and kicks off escrow
 * (PROMPT 60; QTE-03, PAY-01).
 *
 * Accepting is the single most consequential write in the marketplace — it is
 * where a negotiation becomes a contract and money starts to move — so it is one
 * atomic transaction that does four things and either all of them happen or none:
 *
 *   1. mark the accepted quote ACCEPTED (and any sibling live quote DECLINED),
 *   2. move the job QUOTED → ACCEPTED,
 *   3. snapshot the fee split onto a new PENDING_PAYMENT booking, and
 *   4. record the opening BookingStatusEvent.
 *
 * The escrow COLLECTION itself is not here — this emits EscrowInitiationRequested
 * and stops. PROMPTS 62-65 own the Campay side. The seam is deliberate: booking
 * creation must not depend on a payment provider being reachable, or a Campay
 * outage would block agreements from being formed at all.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly jobs: JobsService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /**
   * The client accepts a worker's quote (QTE-03). Creates the booking at the
   * agreed price and requests escrow initiation.
   */
  async acceptQuote(user: AuthenticatedUser, quoteId: string): Promise<BookingRow> {
    // Load the quote scoped to the caller's own job: another client's quote id
    // is simply not found, never a 403 that confirms it exists.
    const quote = await this.prisma.client.quote.findFirst({
      where: { id: quoteId, job: { posterId: user.id } },
      select: {
        id: true,
        jobId: true,
        workerId: true,
        price: true,
        status: true,
        job: { select: { posterId: true, status: true } },
      },
    });

    if (!quote) {
      throw new AppException(HttpStatus.NOT_FOUND, 'QUOTE_NOT_FOUND', 'That quote was not found.');
    }

    if (quote.status !== QuoteStatus.SENT && quote.status !== QuoteStatus.VIEWED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'QUOTE_NOT_ACCEPTABLE',
        'This quote can no longer be accepted.',
      );
    }

    if (quote.job.status !== JobStatus.QUOTED && quote.job.status !== JobStatus.OPEN) {
      // A job that has already moved past QUOTED (a quote was accepted, or it was
      // cancelled) cannot accept another. The unique booking-per-quote constraint
      // is the last line; this is the friendly one.
      throw new AppException(
        HttpStatus.CONFLICT,
        'JOB_NOT_ACCEPTING',
        'This job has already been awarded or is no longer open.',
      );
    }

    const feeBps = await this.settings.platformFeeBps();
    const split = computeFeeSplit(quote.price, feeBps);
    const clientId = user.id;
    const requestId = getRequestId();

    let booking: BookingRow;
    try {
      booking = await this.prisma.client.$transaction(async (tx) => {
        // 1. Accept this quote; decline the other live ones on the same job — a
        //    client cannot hold two workers to two prices for one job.
        await tx.quote.update({
          where: { id: quoteId },
          data: { status: QuoteStatus.ACCEPTED, respondedAt: new Date() },
        });
        await tx.quote.updateMany({
          where: {
            jobId: quote.jobId,
            id: { not: quoteId },
            status: { in: [QuoteStatus.SENT, QuoteStatus.VIEWED, QuoteStatus.DRAFT] },
          },
          data: { status: QuoteStatus.DECLINED, respondedAt: new Date() },
        });

        // 2. Create the booking with the snapshotted fee split.
        const created = await tx.booking.create({
          data: {
            jobId: quote.jobId,
            quoteId,
            workerId: quote.workerId,
            clientId,
            agreedPrice: split.agreedPrice,
            platformFeeBps: split.platformFeeBps,
            platformFeeAmount: split.platformFeeAmount,
            workerPayoutAmount: split.workerPayoutAmount,
            status: BookingStatus.PENDING_PAYMENT,
            escrowInitiatedAt: new Date(),
          },
          select: BOOKING_SELECT,
        });

        // 3. Opening booking event — the money audit trail (CLAUDE.md).
        await tx.bookingStatusEvent.create({
          data: {
            bookingId: created.id,
            fromStatus: null,
            toStatus: BookingStatus.PENDING_PAYMENT,
            actorId: clientId,
            note: 'Quote accepted; escrow initiation requested',
            requestId,
          },
        });

        // 4. Mark the hired application HIRED, if the quote grew out of one.
        await tx.jobApplication.updateMany({
          where: { jobId: quote.jobId, workerId: quote.workerId },
          data: { status: 'HIRED', statusUpdatedAt: new Date() },
        });

        return created;
      });
    } catch (error) {
      // The unique (quoteId) constraint: two concurrent accepts race to one
      // booking, and the loser gets a clean conflict rather than a second escrow.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          'ALREADY_BOOKED',
          'This quote has already been accepted.',
        );
      }
      throw error;
    }

    // Move the job QUOTED → ACCEPTED. Outside the booking transaction on purpose:
    // it runs the job state machine and appends its own JobStatusEvent, and the
    // booking's unique constraint has already made the accept idempotent, so a
    // retry cannot double-book even though these are two transactions.
    await this.jobs.applySystemTransition(quote.jobId, JobStatus.ACCEPTED, {
      actorId: clientId,
      note: 'Quote accepted',
      requestId,
    });

    // The audit log for the money event (CLAUDE.md: audit every money event).
    await this.prisma.client.auditLog.create({
      data: {
        actorId: clientId,
        action: 'booking.created',
        target: `Booking:${booking.id}`,
        requestId,
        meta: {
          jobId: booking.jobId,
          quoteId: booking.quoteId,
          workerId: booking.workerId,
          agreedPrice: booking.agreedPrice,
          platformFeeAmount: booking.platformFeeAmount,
          workerPayoutAmount: booking.workerPayoutAmount,
        },
      },
    });

    this.events.emit(
      QUOTE_ACCEPTED,
      new QuoteAcceptedEvent({
        quoteId,
        jobId: booking.jobId,
        workerId: booking.workerId,
        clientId,
        bookingId: booking.id,
        price: booking.agreedPrice,
        requestId,
      }),
    );

    // The seam PROMPTS 62-65 plug into: money must now be collected into escrow.
    this.events.emit(
      ESCROW_INITIATION_REQUESTED,
      new EscrowInitiationRequestedEvent({
        bookingId: booking.id,
        jobId: booking.jobId,
        quoteId: booking.quoteId,
        clientId,
        workerId: booking.workerId,
        agreedPrice: booking.agreedPrice,
        platformFeeAmount: booking.platformFeeAmount,
        workerPayoutAmount: booking.workerPayoutAmount,
        requestId,
      }),
    );

    logger.info('Booking created; escrow initiation requested', {
      payload: {
        bookingId: booking.id,
        jobId: booking.jobId,
        agreedPrice: booking.agreedPrice,
      },
    });

    return booking;
  }
}
