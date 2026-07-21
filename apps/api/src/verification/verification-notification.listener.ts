import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { createLogger } from '../lib/logger';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import {
  VERIFICATION_APPROVED,
  VERIFICATION_INFO_REQUESTED,
  VERIFICATION_REJECTED,
  VerificationApprovedEvent,
  VerificationInfoRequestedEvent,
  VerificationRejectedEvent,
} from './verification.events';
import { CHECK_DEFINITIONS, rejectionMessageKey } from './verification.model';

const logger = createLogger('verification:notifications');

/**
 * Turns verification outcomes into notification requests (NOT-01).
 *
 * The dispatcher pattern's seam again: this module emits facts and this adapter
 * translates one into a template key. Preferences, channel priority, EN/FR
 * rendering, queueing and retries all belong downstream.
 */
@Injectable()
export class VerificationNotificationListener {
  constructor(private readonly events: EventEmitter2) {}

  @OnEvent(VERIFICATION_APPROVED)
  onApproved(event: VerificationApprovedEvent): void {
    // Checks settled automatically are not announced. "Your phone is verified"
    // arriving one second after the user typed the code is noise, and the OTP
    // screen has already told them.
    if (!CHECK_DEFINITIONS[event.checkType].requiresReview) {
      return;
    }

    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.subjectId,
        templateKey: 'verification.approved',
        variables: {
          checkType: event.checkType,
          checkLabelKey: `Verification.check.${event.checkType}`,
        },
        requestId: event.requestId,
      }),
    );
  }

  /**
   * The friendly retry (TRU-07).
   *
   * The template receives the reason CODE and resolves the copy in EN/FR — which
   * is the only way "We couldn't read your ID clearly. Try again in better
   * lighting" can also exist in French without being written twice at the call
   * site.
   */
  @OnEvent(VERIFICATION_REJECTED)
  onRejected(event: VerificationRejectedEvent): void {
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.subjectId,
        templateKey: 'verification.rejected',
        variables: {
          checkType: event.checkType,
          checkLabelKey: `Verification.check.${event.checkType}`,
          reason: event.reason,
          reasonKey: rejectionMessageKey(event.reason),
          retryable: event.retryable,
        },
        requestId: event.requestId,
      }),
    );

    if (!event.retryable) {
      logger.warn('Verification rejected without a retry path', {
        result: { subjectId: event.subjectId, reason: event.reason },
      });
    }
  }

  @OnEvent(VERIFICATION_INFO_REQUESTED)
  onInfoRequested(event: VerificationInfoRequestedEvent): void {
    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.subjectId,
        templateKey: 'verification.info_requested',
        variables: {
          checkLabelKey: `Verification.check.${event.checkType}`,
          infoRequest: event.infoRequest,
        },
        requestId: event.requestId,
      }),
    );
  }
}
