import { NotificationCategory, NotificationChannel } from '@kavio/database';
import {
  buildDefaultPreferences,
  getChannelPriority,
  getEmailProviderName,
  isSmsEnabled,
} from './notification.config';

describe('notification config', () => {
  describe('getChannelPriority', () => {
    it('defaults to in-app → push → email → SMS', () => {
      // IN_APP leads: it is the only channel that cannot fail for want of a
      // subscription or a mailbox, so the notice is always waiting in the
      // Notification Center whatever happens on the outward channels (NOT-02).
      expect(getChannelPriority({})).toEqual([
        NotificationChannel.IN_APP,
        NotificationChannel.WEB_PUSH,
        NotificationChannel.EMAIL,
        NotificationChannel.SMS,
      ]);
    });

    it('accepts a configured order', () => {
      expect(getChannelPriority({ NOTIFICATIONS_CHANNEL_PRIORITY: 'EMAIL,WEB_PUSH' })).toEqual([
        NotificationChannel.EMAIL,
        NotificationChannel.WEB_PUSH,
      ]);
    });

    it('falls back to the default when the override is empty or all-invalid', () => {
      expect(getChannelPriority({ NOTIFICATIONS_CHANNEL_PRIORITY: '   ' })).toHaveLength(4);
      expect(getChannelPriority({ NOTIFICATIONS_CHANNEL_PRIORITY: 'CARRIER_PIGEON' })).toHaveLength(
        4,
      );
    });
  });

  describe('isSmsEnabled', () => {
    it('is OFF unless explicitly enabled (launch constraint)', () => {
      expect(isSmsEnabled({})).toBe(false);
      expect(isSmsEnabled({ NOTIFICATIONS_SMS_ENABLED: 'false' })).toBe(false);
      expect(isSmsEnabled({ NOTIFICATIONS_SMS_ENABLED: '1' })).toBe(false);
      expect(isSmsEnabled({ NOTIFICATIONS_SMS_ENABLED: 'true' })).toBe(true);
    });
  });

  describe('getEmailProviderName', () => {
    it('defaults to console without a Resend key, and to resend with one', () => {
      expect(getEmailProviderName({})).toBe('console');
      expect(getEmailProviderName({ RESEND_API_KEY: 'k' })).toBe('resend');
    });

    it('lets an explicit setting win', () => {
      expect(
        getEmailProviderName({ RESEND_API_KEY: 'k', NOTIFICATIONS_EMAIL_PROVIDER: 'console' }),
      ).toBe('console');
    });
  });

  describe('buildDefaultPreferences', () => {
    const rows = buildDefaultPreferences('user-1');

    it('covers every channel × category cell exactly once', () => {
      const channels = Object.values(NotificationChannel).length;
      const categories = Object.values(NotificationCategory).length;
      expect(rows).toHaveLength(channels * categories);
      expect(new Set(rows.map((r) => `${r.channel}:${r.category}`)).size).toBe(rows.length);
    });

    it('seeds SMS disabled because the channel is deferred', () => {
      const sms = rows.filter((r) => r.channel === NotificationChannel.SMS);
      expect(sms.every((r) => r.enabled === false)).toBe(true);
    });

    it('seeds marketing opt-out but transactional categories opt-in', () => {
      const emailMarketing = rows.find(
        (r) =>
          r.channel === NotificationChannel.EMAIL && r.category === NotificationCategory.MARKETING,
      );
      const emailPayments = rows.find(
        (r) =>
          r.channel === NotificationChannel.EMAIL && r.category === NotificationCategory.PAYMENTS,
      );

      expect(emailMarketing?.enabled).toBe(false);
      expect(emailPayments?.enabled).toBe(true);
    });
  });
});
