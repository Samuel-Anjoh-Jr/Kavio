import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import {
  DISPUTE_OPENED,
  DISPUTE_RESOLVED,
  ESCROW_REFUNDED,
  ESCROW_RELEASED,
  PAYMENT_FAILED,
  PAYMENT_RECEIVED,
  DisputeOpenedEvent,
  DisputeResolvedEvent,
  EscrowRefundedEvent,
  EscrowReleasedEvent,
  PaymentFailedEvent,
  PaymentReceivedEvent,
} from './events/payment.events';

/**
 * Turns payment & escrow events into notification requests (PAY-01…PAY-06, ADM-05).
 *
 * Each maps a money fact to a template key + typed variables and hands off to the
 * dispatcher — preferences, channel, EN/FR and queueing are all downstream. Every
 * event crosses to the party who needs to hear it: funds secured → the worker;
 * released → the worker; refunded → the client; a failed collection → whoever
 * tried to pay; a dispute → the other party, then both on resolution.
 */
@Injectable()
export class PaymentsNotificationListener {
  constructor(
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(PAYMENT_RECEIVED)
  async onPaymentReceived(event: PaymentReceivedEvent): Promise<void> {
    // The worker learns the money is secured and work can begin.
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.workerId,
        templateKey: 'payment.received',
        variables: { jobTitle: await this.jobTitle(event.jobId), amount: event.amount },
        requestId: event.requestId,
      }),
    );
  }

  @OnEvent(ESCROW_RELEASED)
  async onReleased(event: EscrowReleasedEvent): Promise<void> {
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.workerId,
        templateKey: 'escrow.released',
        variables: { jobTitle: await this.jobTitle(event.jobId), amount: event.payoutAmount },
        requestId: event.requestId,
      }),
    );
  }

  @OnEvent(ESCROW_REFUNDED)
  async onRefunded(event: EscrowRefundedEvent): Promise<void> {
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.clientId,
        templateKey: 'escrow.refunded',
        variables: { jobTitle: await this.jobTitle(event.jobId), amount: event.amount },
        requestId: event.requestId,
      }),
    );
  }

  @OnEvent(PAYMENT_FAILED)
  onFailed(event: PaymentFailedEvent): void {
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.userId,
        templateKey: 'payment.failed',
        variables: { amount: event.amount, reasonKey: event.reasonKey },
        requestId: event.requestId,
      }),
    );
  }

  @OnEvent(DISPUTE_OPENED)
  async onDisputeOpened(event: DisputeOpenedEvent): Promise<void> {
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.otherPartyId,
        templateKey: 'dispute.opened',
        variables: { jobTitle: await this.jobTitle(event.jobId) },
        requestId: event.requestId,
      }),
    );
  }

  @OnEvent(DISPUTE_RESOLVED)
  async onDisputeResolved(event: DisputeResolvedEvent): Promise<void> {
    const jobTitle = await this.jobTitle(event.jobId);
    for (const userId of [event.clientId, event.workerId]) {
      this.events.emit(
        NOTIFICATION_REQUESTED,
        new NotificationRequestedEvent({
          userId,
          templateKey: 'dispute.resolved',
          variables: { jobTitle, resolution: event.resolution },
          requestId: event.requestId,
        }),
      );
    }
  }

  private async jobTitle(jobId: string): Promise<string> {
    const job = await this.prisma.client.job.findUnique({
      where: { id: jobId },
      select: { title: true },
    });
    return job?.title?.trim() || 'a job';
  }
}
