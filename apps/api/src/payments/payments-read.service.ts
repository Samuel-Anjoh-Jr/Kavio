import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DisputeStatus,
  EscrowState,
  Prisma,
  TransactionStatus,
  TransactionType,
} from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type {
  DisputeView,
  EscrowView,
  PaymentMethodView,
  TransactionView,
  WalletView,
} from './models/payments.model';

/** Escrow states where money is still held — the wallet's in-escrow overview. */
const ACTIVE_ESCROW_STATES: EscrowState[] = [
  EscrowState.PAID,
  EscrowState.ACCEPTED,
  EscrowState.IN_PROGRESS,
  EscrowState.COMPLETED,
  EscrowState.DISPUTED,
];

export interface TransactionFilter {
  type?: TransactionType;
  status?: TransactionStatus;
  limit?: number;
  offset?: number;
}

const TXN_SELECT = {
  id: true,
  type: true,
  status: true,
  direction: true,
  amount: true,
  description: true,
  failureReason: true,
  bookingId: true,
  createdAt: true,
  settledAt: true,
} as const;

/**
 * Payments READS (PAY-05, PAY-06; PROMPTS 63, 66, 68). GraphQL only.
 *
 * Every query is scoped to the viewer: a wallet is their own, a transaction list
 * is their own ledger, an escrow timeline is one they are a party to, a dispute
 * is one they opened or are the counterparty/admin on. The scoping lives in the
 * WHERE, not just the capability on the field — a valid token for user A can never
 * read user B's money by guessing an id.
 */
@Injectable()
export class PaymentsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async wallet(user: AuthenticatedUser): Promise<WalletView> {
    const [wallet, inEscrow, pendingPayout, last] = await Promise.all([
      this.prisma.client.wallet.findUnique({
        where: { userId: user.id },
        select: { availableBalance: true },
      }),
      this.prisma.client.escrowHold.aggregate({
        _sum: { amount: true },
        where: { clientId: user.id, state: { in: ACTIVE_ESCROW_STATES } },
      }),
      this.prisma.client.escrowHold.aggregate({
        _sum: { payoutAmount: true },
        where: { workerId: user.id, state: { in: ACTIVE_ESCROW_STATES } },
      }),
      this.prisma.client.transaction.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: TXN_SELECT,
      }),
    ]);

    return {
      availableBalance: wallet?.availableBalance ?? 0,
      inEscrow: inEscrow._sum.amount ?? 0,
      pendingPayout: pendingPayout._sum.payoutAmount ?? 0,
      currency: 'XAF',
      lastTransaction: last ?? null,
    };
  }

  async paymentMethods(user: AuthenticatedUser): Promise<PaymentMethodView[]> {
    return this.prisma.client.paymentMethod.findMany({
      where: { userId: user.id, isActive: true },
      select: {
        id: true,
        type: true,
        label: true,
        phone: true,
        maskedAccount: true,
        operator: true,
        isDefault: true,
        createdAt: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** The transaction history with type/status filters and pagination (PAY-05). */
  async transactions(
    user: AuthenticatedUser,
    filter: TransactionFilter,
  ): Promise<TransactionView[]> {
    const where: Prisma.TransactionWhereInput = { userId: user.id };
    if (filter.type) where.type = filter.type;
    if (filter.status) where.status = filter.status;
    return this.prisma.client.transaction.findMany({
      where,
      select: TXN_SELECT,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(filter.limit ?? 30, 1), 100),
      skip: Math.max(filter.offset ?? 0, 0),
    });
  }

  /** One transaction's detail, scoped to the owner (PAY-05 "per-item detail"). */
  async transaction(user: AuthenticatedUser, id: string): Promise<TransactionView | null> {
    return this.prisma.client.transaction.findFirst({
      where: { id, userId: user.id },
      select: TXN_SELECT,
    });
  }

  /** The escrow timeline for a booking the viewer is a party to (PAY-02). */
  async escrow(user: AuthenticatedUser, bookingId: string): Promise<EscrowView | null> {
    const hold = await this.prisma.client.escrowHold.findFirst({
      where: { bookingId, OR: [{ clientId: user.id }, { workerId: user.id }] },
      select: {
        id: true,
        bookingId: true,
        state: true,
        amount: true,
        feeAmount: true,
        payoutAmount: true,
        paidAt: true,
        releasedAt: true,
        statusEvents: {
          orderBy: { createdAt: 'asc' },
          select: { fromState: true, toState: true, note: true, createdAt: true },
        },
      },
    });
    if (!hold) return null;
    return {
      id: hold.id,
      bookingId: hold.bookingId,
      state: hold.state,
      amount: hold.amount,
      feeAmount: hold.feeAmount,
      payoutAmount: hold.payoutAmount,
      timeline: hold.statusEvents,
      paidAt: hold.paidAt,
      releasedAt: hold.releasedAt,
    };
  }

  /** A dispute, visible to its parties (PAY-03). Admins read via the admin queue. */
  async dispute(user: AuthenticatedUser, disputeId: string): Promise<DisputeView> {
    const dispute = await this.prisma.client.dispute.findFirst({
      where: {
        id: disputeId,
        OR: [
          { openedById: user.id },
          { booking: { clientId: user.id } },
          { booking: { workerId: user.id } },
        ],
      },
      select: {
        id: true,
        jobId: true,
        bookingId: true,
        openedById: true,
        reason: true,
        status: true,
        resolution: true,
        resolutionNote: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            authorId: true,
            body: true,
            createdAt: true,
            attachments: {
              select: { id: true, mediaAsset: { select: { s3Key: true, visibility: true } } },
            },
          },
        },
        createdAt: true,
      },
    });
    if (!dispute) {
      throw new AppException(HttpStatus.NOT_FOUND, 'DISPUTE_NOT_FOUND', 'Dispute not found.');
    }

    const messages = await Promise.all(
      dispute.messages.map(async (m) => ({
        id: m.id,
        authorId: m.authorId,
        body: m.body,
        createdAt: m.createdAt,
        attachments: await Promise.all(
          m.attachments.map(async (a) => ({
            id: a.id,
            url: await this.storage.urlFor(a.mediaAsset.s3Key, a.mediaAsset.visibility),
          })),
        ),
      })),
    );

    return {
      id: dispute.id,
      jobId: dispute.jobId,
      bookingId: dispute.bookingId,
      openedById: dispute.openedById,
      reason: dispute.reason,
      status: dispute.status,
      resolution: dispute.resolution,
      resolutionNote: dispute.resolutionNote,
      messages,
      createdAt: dispute.createdAt,
    };
  }

  /** The admin dispute queue (ADM-05). */
  async disputeQueue(status?: DisputeStatus): Promise<DisputeView[]> {
    const disputes = await this.prisma.client.dispute.findMany({
      where: status ? { status } : { status: { not: DisputeStatus.RESOLVED } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        jobId: true,
        bookingId: true,
        openedById: true,
        reason: true,
        status: true,
        resolution: true,
        resolutionNote: true,
        createdAt: true,
      },
    });
    return disputes.map((d) => ({ ...d, messages: [] }));
  }
}
