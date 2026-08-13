import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { createLogger } from '../lib/logger';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import {
  FEATURED_APPROVED,
  FEATURED_REJECTED,
  FeaturedApprovedEvent,
  FeaturedRejectedEvent,
} from './featured.events';

const logger = createLogger('featured:notifications');

/**
 * Turns featured-placement decisions into notification requests (business
 * plan: "Featured/Verified Business tier").
 *
 * The dispatcher pattern's seam again: this module emits facts and this
 * adapter translates one into a template key. Preferences, channel priority,
 * EN/FR rendering, queueing and retries all belong downstream.
 *
 * No listener for FEATURED_REQUESTED: the admin console's review queue is how
 * staff see a new request, the same as the verification pipeline — there is
 * no separate "you have a new submission" notice for that board either.
 */
@Injectable()
export class FeaturedNotificationListener {
  constructor(private readonly events: EventEmitter2) {}

  @OnEvent(FEATURED_APPROVED)
  onApproved(event: FeaturedApprovedEvent): void {
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.userId,
        templateKey: 'featured.approved',
        variables: {
          extraCommissionPercent: event.extraCommissionBps / 100,
        },
        requestId: event.requestId,
      }),
    );

    logger.info('Featured approval notified', { result: { userId: event.userId } });
  }

  @OnEvent(FEATURED_REJECTED)
  onRejected(event: FeaturedRejectedEvent): void {
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.userId,
        templateKey: 'featured.rejected',
        variables: { reason: event.reason },
        requestId: event.requestId,
      }),
    );
  }
}
