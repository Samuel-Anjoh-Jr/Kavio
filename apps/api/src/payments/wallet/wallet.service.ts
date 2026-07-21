import { HttpStatus, Injectable } from '@nestjs/common';
import { TransactionStatus, TransactionType } from '@trustpro/database';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { AppException } from '../../lib/app-exception';
import { createLogger, getRequestId } from '../../lib/logger';
import { PrismaService } from '../../prisma/prisma.service';
import { CampayService } from '../campay/campay.service';
import { LedgerService } from '../ledger.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import type { AddMoneyDto, WithdrawDto } from './dto/wallet.dto';

const logger = createLogger('wallet');

export interface WalletMovementResult {
  transactionId: string;
  reference: string;
  status: TransactionStatus;
  amount: number;
}

/**
 * Wallet money movements (PAY-05): Add Money and Withdraw, both via Campay.
 *
 * The two are asymmetric on purpose, and the asymmetry is the safe choice:
 *
 *   ADD MONEY credits ONLY on the confirmed webhook. A collection that is never
 *   approved must not inflate a balance, so the deposit sits PENDING until Campay
 *   says SUCCESS.
 *
 *   WITHDRAW reserves the funds up front — it debits the wallet and writes a
 *   PENDING row before calling Campay — so the same balance cannot be withdrawn
 *   twice by two concurrent requests. If Campay refuses the payout, the reserve is
 *   handed straight back in a compensating transaction; a later FAILED webhook does
 *   the same, idempotently.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campay: CampayService,
    private readonly ledger: LedgerService,
    private readonly methods: PaymentMethodsService,
  ) {}

  /** Add money to the wallet (PAY-05). Credited on the confirmed webhook. */
  async addMoney(user: AuthenticatedUser, dto: AddMoneyDto): Promise<WalletMovementResult> {
    const method = await this.methods.resolveForPayment(user.id, dto.paymentMethodId);
    if (!method.phone) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'METHOD_NOT_CHARGEABLE',
        'This payment method cannot be charged directly. Choose a Mobile Money method.',
      );
    }

    const externalReference = `dep_${user.id.slice(0, 8)}_${randomUUID().slice(0, 8)}`;
    const initiation = await this.campay.collect({
      amountXaf: dto.amount,
      phone: method.phone,
      description: 'Wallet top-up',
      externalReference,
    });

    const txn = await this.prisma.client.$transaction((tx) =>
      this.ledger.record(tx, {
        userId: user.id,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        amount: dto.amount,
        paymentMethodId: method.id,
        campayReference: initiation.reference,
        externalReference,
        description: 'Wallet top-up',
      }),
    );

    await this.audit(user.id, 'wallet.deposit_initiated', dto.amount, initiation.reference);
    logger.info('Wallet deposit initiated', {
      payload: { userId: user.id, reference: initiation.reference },
    });

    return {
      transactionId: txn.id,
      reference: initiation.reference,
      status: TransactionStatus.PENDING,
      amount: dto.amount,
    };
  }

  /** Withdraw money to a payment method (PAY-05). Reserves the funds up front. */
  async withdraw(user: AuthenticatedUser, dto: WithdrawDto): Promise<WalletMovementResult> {
    const method = await this.methods.resolveForPayment(user.id, dto.paymentMethodId);
    if (!method.phone) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'METHOD_NOT_PAYABLE',
        'This method cannot receive a payout. Choose a Mobile Money method.',
      );
    }

    const externalReference = `wd_${user.id.slice(0, 8)}_${randomUUID().slice(0, 8)}`;

    // Reserve the funds and write the PENDING row before we ask Campay to pay out.
    // adjustBalance rejects an overdraw as INSUFFICIENT_FUNDS.
    const txn = await this.prisma.client.$transaction(async (tx) => {
      await this.ledger.adjustBalance(tx, user.id, -dto.amount);
      return this.ledger.record(tx, {
        userId: user.id,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
        amount: dto.amount,
        paymentMethodId: method.id,
        externalReference,
        description: 'Wallet withdrawal',
      });
    });

    let reference: string;
    try {
      const initiation = await this.campay.withdraw({
        amountXaf: dto.amount,
        phone: method.phone,
        description: 'Wallet withdrawal',
        externalReference,
      });
      reference = initiation.reference;
      await this.prisma.client.transaction.update({
        where: { id: txn.id },
        data: { campayReference: reference },
      });
    } catch (error) {
      // Campay refused the payout: hand the reserve straight back and fail the row.
      await this.prisma.client.$transaction(async (tx) => {
        await this.ledger.adjustBalance(tx, user.id, dto.amount);
        await tx.transaction.update({
          where: { id: txn.id },
          data: {
            status: TransactionStatus.FAILED,
            failureReason: 'provider_unreachable',
            settledAt: new Date(),
          },
        });
      });
      logger.warn('Withdrawal reversed after provider error', {
        payload: { userId: user.id, amount: dto.amount },
        result: String(error),
      });
      throw error;
    }

    await this.audit(user.id, 'wallet.withdrawal_initiated', dto.amount, reference);
    logger.info('Wallet withdrawal initiated', {
      payload: { userId: user.id, reference },
    });

    return {
      transactionId: txn.id,
      reference,
      status: TransactionStatus.PENDING,
      amount: dto.amount,
    };
  }

  private async audit(
    userId: string,
    action: string,
    amount: number,
    reference: string,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        actorId: userId,
        action,
        target: `User:${userId}`,
        requestId: getRequestId() ?? null,
        meta: { amount, reference },
      },
    });
  }
}
