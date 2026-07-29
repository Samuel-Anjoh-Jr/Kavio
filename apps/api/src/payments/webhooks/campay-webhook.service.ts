import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { TransactionStatus, TransactionType } from '@kavio/database';
import { AppException } from '../../lib/app-exception';
import { createLogger, getRequestId } from '../../lib/logger';
import { PrismaService } from '../../prisma/prisma.service';
import { CampayService } from '../campay/campay.service';
import { normaliseCampayStatus, type SettlementOutcome } from '../campay/campay.types';
import { EscrowService } from '../escrow/escrow.service';
import { LedgerService } from '../ledger.service';
import { PAYMENT_FAILED, PaymentFailedEvent } from '../events/payment.events';
import { CAMPAY_STUB_SETTLED, type CampayStubSettledEvent } from '../payments.events';
import type { CampayWebhookDto } from './dto/campay-webhook.dto';

const logger = createLogger('campay-webhook');

/** Maps a Campay failure reason to a coded key for localized plain-language copy. */
function reasonKey(reason: string | undefined): string {
  const r = (reason ?? '').toLowerCase();
  if (r.includes('insufficient') || r.includes('balance')) return 'insufficient_funds';
  if (r.includes('timeout') || r.includes('timed out')) return 'operator_timeout';
  if (r.includes('declin') || r.includes('reject') || r.includes('cancel')) return 'declined';
  return 'payment_failed';
}

/**
 * Campay webhook + reconciliation (PROMPT 65; PAY-06, NFR-AVAIL-02).
 *
 * The one place external confirmations turn into settled money. Three properties
 * carry it, all load-bearing:
 *
 *   IDEMPOTENT ON THE EXTERNAL REF. A transaction is looked up by the reference WE
 *   generated; a webhook that fires twice finds a row already SUCCESS/FAILED and
 *   returns without touching money again.
 *
 *   RECONCILABLE. The exact same settlement path is reachable by POLLING Campay
 *   (`reconcile`), so a webhook that never arrived after a transient failure is
 *   recovered by asking Campay directly rather than leaving money in limbo.
 *
 *   EXPLICIT FAILURES. A failed collection/payout records a coded reason (declined,
 *   insufficient funds, operator timeout) and emits it — never a silent failure.
 *
 * Every settlement writes an audit-log row (CLAUDE.md: audit every money event).
 */
@Injectable()
export class CampayWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly ledger: LedgerService,
    private readonly escrow: EscrowService,
    private readonly campay: CampayService,
  ) {}

  /** Handle a signed webhook (PAY-06). Verifies the signature, then settles. */
  async handleWebhook(payload: CampayWebhookDto): Promise<{ handled: boolean }> {
    if (!this.campay.verifyWebhookSignature(payload.signature)) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_WEBHOOK_SIGNATURE',
        'Webhook signature verification failed.',
      );
    }
    const outcome = normaliseCampayStatus(payload.status);
    return this.settleByExternalRef(payload.external_reference, outcome, {
      campayReference: payload.reference,
      reason: payload.reason,
      source: 'webhook',
    });
  }

  /**
   * Reconcile a single transaction against Campay (PAY-06). Polls the provider for
   * the authoritative status and applies it through the same settlement path.
   */
  async reconcile(externalReference: string): Promise<{ handled: boolean }> {
    const txn = await this.prisma.client.transaction.findUnique({
      where: { externalReference },
      select: { campayReference: true, status: true },
    });
    if (!txn) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'TRANSACTION_NOT_FOUND',
        'Transaction not found.',
      );
    }
    if (txn.status !== TransactionStatus.PENDING) {
      return { handled: false };
    }
    const ref = txn.campayReference ?? externalReference;
    const status = await this.campay.getStatus(ref);
    if (!status) {
      return { handled: false };
    }
    return this.settleByExternalRef(externalReference, normaliseCampayStatus(status.status), {
      campayReference: status.reference,
      reason: status.reason,
      source: 'reconcile',
    });
  }

  /**
   * Settles a stub-mode transaction the moment it is written (dev and CI only).
   *
   * Deliberately routed through `reconcile` rather than settling directly: the
   * stub must exercise the same path a live webhook does, or the one flow that
   * never runs in development is the one that runs in production. If Campay is
   * live this listener never fires, because the event is never emitted.
   */
  @OnEvent(CAMPAY_STUB_SETTLED)
  async onStubSettled(event: CampayStubSettledEvent): Promise<void> {
    try {
      const result = await this.reconcile(event.externalReference);
      logger.info('Stub payment auto-settled', {
        payload: { externalReference: event.externalReference, handled: result.handled },
      });
    } catch (error) {
      // A dev convenience must never take down the request that triggered it.
      logger.warn('Stub auto-settle failed', {
        payload: { externalReference: event.externalReference },
        result: String(error),
      });
    }
  }

  /** Reconcile every pending transaction older than `olderThanMs`. Admin-triggered. */
  async reconcilePending(
    olderThanMs = 2 * 60 * 1000,
  ): Promise<{ checked: number; settled: number }> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const pending = await this.prisma.client.transaction.findMany({
      where: { status: TransactionStatus.PENDING, createdAt: { lt: cutoff } },
      select: { externalReference: true },
      take: 100,
    });
    let settled = 0;
    for (const t of pending) {
      if (!t.externalReference) continue;
      try {
        const result = await this.reconcile(t.externalReference);
        if (result.handled) settled += 1;
      } catch (error) {
        logger.warn('Reconcile failed for transaction', {
          payload: { externalReference: t.externalReference },
          result: String(error),
        });
      }
    }
    return { checked: pending.length, settled };
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private async settleByExternalRef(
    externalReference: string,
    outcome: SettlementOutcome,
    ctx: { campayReference?: string; reason?: string; source: string },
  ): Promise<{ handled: boolean }> {
    const txn = await this.prisma.client.transaction.findUnique({
      where: { externalReference },
      select: {
        id: true,
        userId: true,
        type: true,
        status: true,
        amount: true,
        bookingId: true,
      },
    });
    if (!txn) {
      logger.warn('Webhook/reconcile for unknown transaction', { payload: { externalReference } });
      // Not an error to Campay — acknowledge so it stops retrying an orphan.
      return { handled: false };
    }

    // Idempotency: a settled row is never re-settled (PAY-06).
    if (txn.status !== TransactionStatus.PENDING) {
      logger.info('Duplicate settlement ignored', {
        payload: { transactionId: txn.id, status: txn.status },
      });
      return { handled: false };
    }
    if (outcome === 'PENDING') {
      return { handled: false };
    }

    const requestId = getRequestId();
    if (outcome === 'SUCCESS') {
      await this.applySuccess(txn, ctx.campayReference);
    } else {
      await this.applyFailure(txn, reasonKey(ctx.reason));
    }

    await this.prisma.client.auditLog.create({
      data: {
        actorId: null,
        action: `payment.${outcome === 'SUCCESS' ? 'settled' : 'failed'}`,
        target: `Transaction:${txn.id}`,
        requestId: requestId ?? null,
        meta: {
          type: txn.type,
          amount: txn.amount,
          source: ctx.source,
          campayReference: ctx.campayReference ?? null,
        },
      },
    });

    return { handled: true };
  }

  private async applySuccess(
    txn: {
      id: string;
      userId: string;
      type: TransactionType;
      amount: number;
      bookingId: string | null;
    },
    campayReference?: string,
  ): Promise<void> {
    const now = new Date();
    if (txn.type === TransactionType.DEPOSIT) {
      // Credit the wallet only now that the collection is confirmed.
      await this.prisma.client.$transaction(async (tx) => {
        await this.ledger.adjustBalance(tx, txn.userId, txn.amount);
        await tx.transaction.update({
          where: { id: txn.id },
          data: {
            status: TransactionStatus.SUCCESS,
            settledAt: now,
            campayReference: campayReference ?? undefined,
          },
        });
      });
    } else if (txn.type === TransactionType.ESCROW_HOLD && txn.bookingId) {
      // Fund the escrow, then mark the collection settled and link the hold.
      const holdId = await this.escrow.fund(txn.bookingId, campayReference ?? '', getRequestId());
      await this.prisma.client.transaction.update({
        where: { id: txn.id },
        data: {
          status: TransactionStatus.SUCCESS,
          settledAt: now,
          escrowHoldId: holdId,
          campayReference: campayReference ?? undefined,
        },
      });
    } else {
      // WITHDRAWAL / others: funds already reserved at initiation; just settle.
      await this.prisma.client.transaction.update({
        where: { id: txn.id },
        data: {
          status: TransactionStatus.SUCCESS,
          settledAt: now,
          campayReference: campayReference ?? undefined,
        },
      });
    }
  }

  private async applyFailure(
    txn: {
      id: string;
      userId: string;
      type: TransactionType;
      amount: number;
      bookingId: string | null;
    },
    failureKey: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.client.$transaction(async (tx) => {
      // A failed withdrawal hands the reserved funds back to the wallet.
      if (txn.type === TransactionType.WITHDRAWAL) {
        await this.ledger.adjustBalance(tx, txn.userId, txn.amount);
      }
      await tx.transaction.update({
        where: { id: txn.id },
        data: { status: TransactionStatus.FAILED, failureReason: failureKey, settledAt: now },
      });
    });

    this.events.emit(
      PAYMENT_FAILED,
      new PaymentFailedEvent({
        userId: txn.userId,
        bookingId: txn.bookingId,
        amount: txn.amount,
        reasonKey: failureKey,
        requestId: getRequestId(),
      }),
    );
  }
}
