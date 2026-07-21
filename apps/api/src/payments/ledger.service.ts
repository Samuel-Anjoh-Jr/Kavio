import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
} from '@trustpro/database';
import { AppException } from '../lib/app-exception';
import { PrismaService } from '../prisma/prisma.service';

/** A Prisma transaction client — every money write runs inside one of these. */
export type Tx = Prisma.TransactionClient;

export interface RecordTransactionInput {
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  bookingId?: string | null;
  escrowHoldId?: string | null;
  paymentMethodId?: string | null;
  campayReference?: string | null;
  externalReference?: string | null;
  failureReason?: string | null;
  description?: string | null;
  metadata?: Prisma.InputJsonValue;
  settledAt?: Date | null;
}

/**
 * The money primitives (PAY-05, PAY-06): the ledger row and the wallet balance,
 * always moved together inside a caller's database transaction.
 *
 * Why the DIRECTION is derived here, once: money-in vs money-out from the wallet
 * owner's point of view is a property of the transaction TYPE, not a free choice
 * at the call site, so deriving it in one place stops a refund from ever being
 * recorded as a debit by a typo.
 *
 * Why `adjustBalance` distrusts its own arithmetic: the Wallet_balance_check
 * constraint is the real guarantee a balance never goes negative, but catching it
 * here turns a raw constraint violation into a clean, typed INSUFFICIENT_FUNDS the
 * client can act on.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** The direction a transaction type moves money, from the wallet owner's side. */
  static directionFor(type: TransactionType): TransactionDirection {
    switch (type) {
      case TransactionType.DEPOSIT:
      case TransactionType.ESCROW_RELEASE:
      case TransactionType.REFUND:
        return TransactionDirection.CREDIT;
      case TransactionType.PAYMENT:
      case TransactionType.ESCROW_HOLD:
      case TransactionType.FEE:
      case TransactionType.WITHDRAWAL:
        return TransactionDirection.DEBIT;
    }
  }

  /** Ensures a wallet row exists for the identity; returns it. Idempotent. */
  async ensureWallet(userId: string): Promise<{ id: string; availableBalance: number }> {
    return this.prisma.client.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true, availableBalance: true },
    });
  }

  /** Records a ledger row inside the caller's transaction. */
  async record(tx: Tx, input: RecordTransactionInput) {
    return tx.transaction.create({
      data: {
        userId: input.userId,
        type: input.type,
        status: input.status,
        direction: LedgerService.directionFor(input.type),
        amount: input.amount,
        bookingId: input.bookingId ?? null,
        escrowHoldId: input.escrowHoldId ?? null,
        paymentMethodId: input.paymentMethodId ?? null,
        campayReference: input.campayReference ?? null,
        externalReference: input.externalReference ?? null,
        failureReason: input.failureReason ?? null,
        description: input.description ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
        settledAt: input.settledAt ?? null,
      },
    });
  }

  /**
   * Moves a wallet's balance by `delta` (may be negative) inside the caller's
   * transaction, ensuring the row exists first. A debit that would overdraw is
   * rejected as INSUFFICIENT_FUNDS rather than allowed to hit the CHECK.
   */
  async adjustBalance(tx: Tx, userId: string, delta: number): Promise<number> {
    await tx.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { userId },
      select: { availableBalance: true },
    });
    const next = wallet.availableBalance + delta;
    if (next < 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'INSUFFICIENT_FUNDS',
        'Your wallet balance is not enough for this.',
      );
    }
    const updated = await tx.wallet.update({
      where: { userId },
      data: { availableBalance: next },
      select: { availableBalance: true },
    });
    return updated.availableBalance;
  }
}
