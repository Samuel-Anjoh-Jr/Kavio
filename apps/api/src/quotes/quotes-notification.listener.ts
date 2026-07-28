import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import {
  QUOTE_ACCEPTED,
  QUOTE_COUNTER_REQUESTED,
  QUOTE_DECLINED,
  QUOTE_SENT,
  QuoteAcceptedEvent,
  QuoteCounterRequestedEvent,
  QuoteDeclinedEvent,
  QuoteSentEvent,
} from './events/quote.events';

/**
 * Turns quote events into notification requests (QTE-01, QTE-02, QTE-03).
 *
 * Each of these crosses parties: a worker sends and the CLIENT hears; a client
 * accepts and the WORKER hears. The adapter maps a fact to a template key + typed
 * variables and hands off to the dispatcher — preferences, channel, EN/FR and
 * queueing are all downstream.
 */
@Injectable()
export class QuotesNotificationListener {
  constructor(
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(QUOTE_SENT)
  async onSent(event: QuoteSentEvent): Promise<void> {
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.clientId,
        templateKey: 'quote.received',
        variables: { jobTitle: await this.jobTitle(event.jobId), price: event.price },
        // No relevantRole: the recipient posted this job as CLIENT or BUSINESS
        // and the job screen renders from that relationship, not active role.
        metadata: this.jobLink(event.jobId),
        requestId: event.requestId,
      }),
    );
  }

  @OnEvent(QUOTE_ACCEPTED)
  async onAccepted(event: QuoteAcceptedEvent): Promise<void> {
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.workerId,
        templateKey: 'quote.accepted',
        variables: { jobTitle: await this.jobTitle(event.jobId), price: event.price },
        metadata: this.jobLink(event.jobId, 'WORKER'),
        requestId: event.requestId,
      }),
    );
  }

  @OnEvent(QUOTE_DECLINED)
  async onDeclined(event: QuoteDeclinedEvent): Promise<void> {
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.workerId,
        templateKey: 'quote.declined',
        variables: { jobTitle: await this.jobTitle(event.jobId) },
        metadata: this.jobLink(event.jobId, 'WORKER'),
        requestId: event.requestId,
      }),
    );
  }

  @OnEvent(QUOTE_COUNTER_REQUESTED)
  async onCounterRequested(event: QuoteCounterRequestedEvent): Promise<void> {
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.workerId,
        templateKey: 'quote.counter_requested',
        variables: {
          jobTitle: await this.jobTitle(event.jobId),
          targetPrice: event.targetPrice,
          message: event.message,
        },
        metadata: this.jobLink(event.jobId, 'WORKER'),
        requestId: event.requestId,
      }),
    );
  }

  /**
   * A quote has no detail screen of its own (QTE-04) — the job it was sent on
   * is the specific record a recipient can act on.
   */
  private jobLink(jobId: string, relevantRole?: 'CLIENT' | 'WORKER'): Record<string, unknown> {
    return {
      jobId,
      deepLink: `/app/jobs/${jobId}`,
      ...(relevantRole ? { relevantRole } : {}),
    };
  }

  private async jobTitle(jobId: string): Promise<string> {
    const job = await this.prisma.client.job.findUnique({
      where: { id: jobId },
      select: { title: true },
    });
    return job?.title?.trim() || 'a job';
  }
}
