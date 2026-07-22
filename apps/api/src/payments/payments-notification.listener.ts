import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Role } from '@trustpro/database';
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
    const jobTitle = await this.jobTitle(event.jobId);

    // The other party learns a dispute was raised and the escrow is frozen, and
    // lands on the case itself rather than on a list they have to search.
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.otherPartyId,
        templateKey: 'dispute.opened',
        variables: { jobTitle },
        metadata: {
          disputeId: event.disputeId,
          jobId: event.jobId,
          deepLink: `/app/disputes/${event.disputeId}`,
        },
        requestId: event.requestId,
      }),
    );

    // And the admins who can actually resolve it are ALERTED, not left to poll
    // the queue (ADM-05). A frozen escrow with nobody watching is a client's
    // money stuck indefinitely; a dispute must land in front of a resolver the
    // moment it opens. Everyone holding the ADMIN role is notified.
    await this.alertAdmins(jobTitle, event.disputeId, event.requestId, [
      event.openedById,
      event.otherPartyId,
    ]);
  }

  /** Fans the dispute-opened alert out to every admin (ADM-05). */
  private async alertAdmins(
    jobTitle: string,
    disputeId: string,
    requestId: string | undefined,
    exclude: string[],
  ): Promise<void> {
    const grants = await this.prisma.client.userRole.findMany({
      where: { role: Role.ADMIN },
      select: { userId: true },
    });
    const skip = new Set(exclude);
    const adminIds = [...new Set(grants.map((g) => g.userId))].filter((id) => !skip.has(id));

    for (const userId of adminIds) {
      this.events.emit(
        NOTIFICATION_REQUESTED,
        new NotificationRequestedEvent({
          userId,
          templateKey: 'dispute.opened',
          variables: { jobTitle },
          // Admins deep-link into the RESOLUTION workspace, not the party view:
          // the same alert has to land each recipient where they can act.
          metadata: {
            disputeId,
            deepLink: `/app/admin/disputes/${disputeId}`,
          },
          requestId,
        }),
      );
    }
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
          metadata: {
            disputeId: event.disputeId,
            jobId: event.jobId,
            deepLink: `/app/disputes/${event.disputeId}`,
          },
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
