import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus, TransactionStatus, TransactionType } from '@trustpro/database';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { AppException } from '../../lib/app-exception';
import { createLogger, getRequestId } from '../../lib/logger';
import { PrismaService } from '../../prisma/prisma.service';
import { CampayService } from '../campay/campay.service';
import { LedgerService } from '../ledger.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import type { PayBookingDto } from './dto/escrow.dto';

const logger = createLogger('escrow-payment');

export interface PayBookingResult {
  transactionId: string;
  reference: string;
  status: TransactionStatus;
  amount: number;
  platformFeeAmount: number;
  workerPayoutAmount: number;
  /** USSD the payer may need to dial to approve (Mobile Money). */
  ussdCode?: string;
}

/**
 * Client-side escrow funding (PAY-01, PAY-02).
 *
 * Turns "the client pressed Pay" into a Campay collection and a PENDING ledger
 * row keyed by our own external reference. Money is NOT held here — the collection
 * comes back PENDING and only a verified webhook (or the reconciliation sweep)
 * flips it to SUCCESS and funds the escrow, so a client who never approves the
 * USSD prompt never ends up with a booking that thinks it was paid.
 *
 * Idempotent: a second Pay on a booking that already has a PENDING collection
 * returns that same collection rather than charging twice — the normal outcome of
 * a double-tap on a bad connection.
 */
@Injectable()
export class EscrowPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campay: CampayService,
    private readonly ledger: LedgerService,
    private readonly methods: PaymentMethodsService,
  ) {}

  async payBooking(
    user: AuthenticatedUser,
    bookingId: string,
    dto: PayBookingDto,
  ): Promise<PayBookingResult> {
    const booking = await this.prisma.client.booking.findFirst({
      where: { id: bookingId, clientId: user.id },
      select: {
        id: true,
        status: true,
        agreedPrice: true,
        platformFeeAmount: true,
        workerPayoutAmount: true,
        job: { select: { title: true } },
        escrowHold: { select: { id: true } },
      },
    });
    if (!booking) {
      // Not the client's booking → not found, never a 403 that confirms it exists.
      throw new AppException(HttpStatus.NOT_FOUND, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }
    if (booking.escrowHold || booking.status !== BookingStatus.PENDING_PAYMENT) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'BOOKING_NOT_PAYABLE',
        'This booking has already been paid.',
      );
    }

    // Return an in-flight collection rather than charging again.
    const pending = await this.prisma.client.transaction.findFirst({
      where: {
        bookingId: booking.id,
        type: TransactionType.ESCROW_HOLD,
        status: TransactionStatus.PENDING,
      },
      select: { id: true, campayReference: true, externalReference: true },
    });
    if (pending) {
      return {
        transactionId: pending.id,
        reference: pending.campayReference ?? pending.externalReference ?? pending.id,
        status: TransactionStatus.PENDING,
        amount: booking.agreedPrice,
        platformFeeAmount: booking.platformFeeAmount,
        workerPayoutAmount: booking.workerPayoutAmount,
      };
    }

    const method = await this.methods.resolveForPayment(user.id, dto.paymentMethodId);
    if (!method.phone) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'METHOD_NOT_CHARGEABLE',
        'This payment method cannot be charged directly. Choose a Mobile Money method.',
      );
    }

    const externalReference = `bk_${booking.id}_${randomUUID().slice(0, 8)}`;
    const requestId = getRequestId();

    const initiation = await this.campay.collect({
      amountXaf: booking.agreedPrice,
      phone: method.phone,
      description: `Escrow: ${booking.job.title}`.slice(0, 60),
      externalReference,
    });

    const txn = await this.prisma.client.$transaction((tx) =>
      this.ledger.record(tx, {
        userId: user.id,
        type: TransactionType.ESCROW_HOLD,
        status: TransactionStatus.PENDING,
        amount: booking.agreedPrice,
        bookingId: booking.id,
        paymentMethodId: method.id,
        campayReference: initiation.reference,
        externalReference,
        description: `Escrow for: ${booking.job.title}`,
      }),
    );

    await this.prisma.client.auditLog.create({
      data: {
        actorId: user.id,
        action: 'payment.initiated',
        target: `Booking:${booking.id}`,
        requestId: requestId ?? null,
        meta: { amount: booking.agreedPrice, reference: initiation.reference },
      },
    });

    logger.info('Booking payment initiated', {
      payload: { bookingId: booking.id, reference: initiation.reference, live: this.campay.live },
    });

    return {
      transactionId: txn.id,
      reference: initiation.reference,
      status: TransactionStatus.PENDING,
      amount: booking.agreedPrice,
      platformFeeAmount: booking.platformFeeAmount,
      workerPayoutAmount: booking.workerPayoutAmount,
      ussdCode: initiation.ussdCode,
    };
  }
}
