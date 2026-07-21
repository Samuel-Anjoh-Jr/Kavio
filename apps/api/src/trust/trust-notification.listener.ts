import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { VerificationTier } from '@trustpro/database';
import { createLogger } from '../lib/logger';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import {
  TierChangedEvent,
  TrustScoreThresholdCrossedEvent,
  TRUST_SCORE_THRESHOLD_CROSSED,
  TRUST_TIER_CHANGED,
} from './trust.events';

const logger = createLogger('trust:notifications');

/**
 * Turns trust domain events into notification requests (TRU-04).
 *
 * This listener is the seam the DISPATCHER PATTERN asks for: the Trust Engine
 * emits facts and knows nothing about email, push or preferences, and this
 * adapter translates a fact into a template key. Everything downstream —
 * per-user preferences, channel priority, EN/FR rendering, queueing, retries —
 * belongs to the NotificationDispatcher.
 */
@Injectable()
export class TrustNotificationListener {
  constructor(private readonly events: EventEmitter2) {}

  @OnEvent(TRUST_TIER_CHANGED)
  onTierChanged(event: TierChangedEvent): void {
    // Only promotions are announced. A demotion is usually the consequence of
    // something the user has already been told about (a dispute, an expired
    // check), and a "you have been downgraded" push on top of that is a kick
    // rather than information.
    if (event.direction !== 'PROMOTED') {
      logger.info('Tier demotion not notified by design', {
        result: { subjectId: event.subjectId, tier: event.tier },
      });
      return;
    }

    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.subjectId,
        templateKey: 'trust.tier_promoted',
        variables: {
          tier: event.tier,
          tierLabelKey: `Trust.tier.${event.tier}`,
          // TRU-05 frames verification as unlocks rather than a checklist.
          unlockKey: `Trust.unlock.${event.tier}`,
        },
        requestId: event.requestId,
      }),
    );
  }

  @OnEvent(TRUST_SCORE_THRESHOLD_CROSSED)
  onThresholdCrossed(event: TrustScoreThresholdCrossedEvent): void {
    if (event.direction !== 'UP') {
      return;
    }

    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.subjectId,
        templateKey: 'trust.score_milestone',
        variables: { score: event.score, threshold: event.threshold },
        requestId: event.requestId,
      }),
    );
  }
}

/** Tiers whose promotion is worth celebrating in-product. Kept for badge consumers. */
export const CELEBRATED_TIERS: readonly VerificationTier[] = [
  VerificationTier.TIER_2,
  VerificationTier.TIER_3,
];
