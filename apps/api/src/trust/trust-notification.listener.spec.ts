import type { EventEmitter2 } from '@nestjs/event-emitter';
import { VerificationTier } from '@trustpro/database';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import { getTemplate, isTemplateKey } from '../notifications/templates/template.registry';
import { TrustNotificationListener } from './trust-notification.listener';
import { TierChangedEvent, TrustScoreThresholdCrossedEvent } from './trust.events';

function makeHarness() {
  const emit = jest.fn();
  const listener = new TrustNotificationListener({ emit } as unknown as EventEmitter2);
  return { listener, emit };
}

const promotion = (overrides: Partial<ConstructorParameters<typeof TierChangedEvent>[0]> = {}) =>
  new TierChangedEvent({
    subjectId: 'worker-1',
    previousTier: VerificationTier.TIER_1,
    tier: VerificationTier.TIER_2,
    direction: 'PROMOTED',
    trustScore: 55,
    ...overrides,
  });

describe('TrustNotificationListener', () => {
  describe('tier changes', () => {
    it('requests a notification through the dispatcher, never a provider', () => {
      const { listener, emit } = makeHarness();

      listener.onTierChanged(promotion());

      expect(emit).toHaveBeenCalledTimes(1);
      const [name, event] = emit.mock.calls[0] as [string, NotificationRequestedEvent];
      expect(name).toBe(NOTIFICATION_REQUESTED);
      expect(event).toBeInstanceOf(NotificationRequestedEvent);
      expect(event.userId).toBe('worker-1');
      expect(event.templateKey).toBe('trust.tier_promoted');
    });

    it('passes the tier and its i18n keys as template variables', () => {
      const { listener, emit } = makeHarness();

      listener.onTierChanged(promotion());

      const [, event] = emit.mock.calls[0] as [string, NotificationRequestedEvent];
      expect(event.variables).toEqual({
        tier: VerificationTier.TIER_2,
        tierLabelKey: 'Trust.tier.TIER_2',
        unlockKey: 'Trust.unlock.TIER_2',
      });
    });

    it('stays silent on a demotion', () => {
      const { listener, emit } = makeHarness();

      listener.onTierChanged(
        promotion({
          previousTier: VerificationTier.TIER_2,
          tier: VerificationTier.TIER_1,
          direction: 'DEMOTED',
        }),
      );

      expect(emit).not.toHaveBeenCalled();
    });

    it('carries the requestId through so the notification traces to its cause', () => {
      const { listener, emit } = makeHarness();

      listener.onTierChanged(promotion({ requestId: 'req-42' }));

      const [, event] = emit.mock.calls[0] as [string, NotificationRequestedEvent];
      expect(event.requestId).toBe('req-42');
    });
  });

  describe('score threshold crossings', () => {
    it('notifies on the way up', () => {
      const { listener, emit } = makeHarness();

      listener.onThresholdCrossed(
        new TrustScoreThresholdCrossedEvent({
          subjectId: 'worker-1',
          previousScore: 48,
          score: 55,
          threshold: 50,
        }),
      );

      const [, event] = emit.mock.calls[0] as [string, NotificationRequestedEvent];
      expect(event.templateKey).toBe('trust.score_milestone');
      expect(event.variables).toEqual({ score: 55, threshold: 50 });
    });

    it('stays silent on the way down', () => {
      const { listener, emit } = makeHarness();

      listener.onThresholdCrossed(
        new TrustScoreThresholdCrossedEvent({
          subjectId: 'worker-1',
          previousScore: 55,
          score: 48,
          threshold: 50,
        }),
      );

      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('templates the listener depends on', () => {
    it.each(['trust.tier_promoted', 'trust.score_milestone'])(
      '%s exists in the localized store with EN and FR copy',
      (key) => {
        expect(isTemplateKey(key)).toBe(true);

        const template = getTemplate(key as 'trust.tier_promoted');
        const email = template.render.EMAIL;
        expect(email?.en).toBeDefined();
        expect(email?.fr).toBeDefined();
      },
    );

    it('files trust notices under the TRUST category so users can mute them', () => {
      // These are encouragement, not security notices — a user who does not want
      // them must be able to turn them off, which needs a non-SECURITY category.
      const template = getTemplate('trust.tier_promoted');
      expect(template.category).toBe('TRUST');
      expect(template.securityCritical).toBeUndefined();
    });
  });
});
