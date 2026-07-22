import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import { REVIEW_SUBMITTED, ReviewSubmittedEvent } from './reviews.events';

/**
 * Turns review events into notification requests (REV-01).
 *
 * The subject hears that they were reviewed; the template, channel, EN/FR copy
 * and queueing are all downstream of the dispatcher. The AUTHOR is deliberately
 * told nothing — they just wrote it — and a hidden review sends no notification
 * either: "your review was removed" is a moderation message, and moderation
 * correspondence belongs to the ADM-08 workspace rather than to this listener.
 */
@Injectable()
export class ReviewNotificationListener {
  constructor(
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(REVIEW_SUBMITTED)
  async onSubmitted(event: ReviewSubmittedEvent): Promise<void> {
    const job = await this.prisma.client.job.findUnique({
      where: { id: event.jobId },
      select: { title: true },
    });

    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.subjectId,
        templateKey: 'review.received',
        variables: { jobTitle: job?.title ?? '', rating: event.rating },
        requestId: event.requestId,
      }),
    );
  }
}
