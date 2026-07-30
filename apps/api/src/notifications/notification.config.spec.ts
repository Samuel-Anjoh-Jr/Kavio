import { NotificationCategory, NotificationChannel } from '@kavio/database';
import {
  buildDefaultPreferences,
  getChannelPriority,
  getEmailProviderName,
  getSmsProviderName,
  getWhatsappProviderName,
  hasTwilioSmsConfig,
  hasTwilioWhatsappConfig,
  isSmsEnabled,
  isWhatsappEnabled,
} from './notification.config';

const TWILIO_SMS_ENV = {
  TWILIO_ACCOUNT_SID: 'AC-test',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_SMS_FROM_NUMBER: '+15017122661',
};

const TWILIO_WHATSAPP_ENV = {
  TWILIO_ACCOUNT_SID: 'AC-test',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_WHATSAPP_FROM_NUMBER: '+14155238886',
};

describe('notification config', () => {
  describe('getChannelPriority', () => {
    it('defaults to in-app → push → email → SMS → WhatsApp', () => {
      // IN_APP leads: it is the only channel that cannot fail for want of a
      // subscription or a mailbox, so the notice is always waiting in the
      // Notification Center whatever happens on the outward channels (NOT-02).
      expect(getChannelPriority({})).toEqual([
        NotificationChannel.IN_APP,
        NotificationChannel.WEB_PUSH,
        NotificationChannel.EMAIL,
        NotificationChannel.SMS,
        NotificationChannel.WHATSAPP,
      ]);
    });

    it('accepts a configured order', () => {
      expect(getChannelPriority({ NOTIFICATIONS_CHANNEL_PRIORITY: 'EMAIL,WEB_PUSH' })).toEqual([
        NotificationChannel.EMAIL,
        NotificationChannel.WEB_PUSH,
      ]);
    });

    it('falls back to the default when the override is empty or all-invalid', () => {
      expect(getChannelPriority({ NOTIFICATIONS_CHANNEL_PRIORITY: '   ' })).toHaveLength(5);
      expect(getChannelPriority({ NOTIFICATIONS_CHANNEL_PRIORITY: 'CARRIER_PIGEON' })).toHaveLength(
        5,
      );
    });
  });

  describe('hasTwilioSmsConfig / hasTwilioWhatsappConfig', () => {
    it('requires every value, not just the shared account credentials', () => {
      expect(hasTwilioSmsConfig({})).toBe(false);
      expect(
        hasTwilioSmsConfig({ TWILIO_ACCOUNT_SID: 'AC-test', TWILIO_AUTH_TOKEN: 'token' }),
      ).toBe(false);
      expect(hasTwilioSmsConfig(TWILIO_SMS_ENV)).toBe(true);

      expect(hasTwilioWhatsappConfig({})).toBe(false);
      expect(hasTwilioWhatsappConfig(TWILIO_SMS_ENV)).toBe(false);
      expect(hasTwilioWhatsappConfig(TWILIO_WHATSAPP_ENV)).toBe(true);
    });
  });

  describe('getSmsProviderName / getWhatsappProviderName', () => {
    it('picks twilio only once its own credentials are complete', () => {
      expect(getSmsProviderName({})).toBe('stub');
      expect(getSmsProviderName(TWILIO_SMS_ENV)).toBe('twilio');
      // Having WhatsApp's from-number doesn't make SMS usable, and vice versa.
      expect(getSmsProviderName(TWILIO_WHATSAPP_ENV)).toBe('stub');

      expect(getWhatsappProviderName({})).toBe('stub');
      expect(getWhatsappProviderName(TWILIO_WHATSAPP_ENV)).toBe('twilio');
      expect(getWhatsappProviderName(TWILIO_SMS_ENV)).toBe('stub');
    });
  });

  describe('isSmsEnabled', () => {
    it('is OFF at launch with no credentials and no override', () => {
      expect(isSmsEnabled({})).toBe(false);
    });

    it('auto-enables once the Twilio SMS credentials are all present', () => {
      expect(isSmsEnabled(TWILIO_SMS_ENV)).toBe(true);
      // Missing the from-number: still OFF, not a half-working channel.
      expect(isSmsEnabled({ TWILIO_ACCOUNT_SID: 'AC-test', TWILIO_AUTH_TOKEN: 'token' })).toBe(
        false,
      );
    });

    it('lets an explicit override win either direction', () => {
      expect(isSmsEnabled({ NOTIFICATIONS_SMS_ENABLED: 'true' })).toBe(true);
      expect(isSmsEnabled({ ...TWILIO_SMS_ENV, NOTIFICATIONS_SMS_ENABLED: 'false' })).toBe(false);
      // Any other value is not a recognised override, so it falls through to
      // auto-detection rather than being treated as truthy.
      expect(isSmsEnabled({ NOTIFICATIONS_SMS_ENABLED: '1' })).toBe(false);
    });
  });

  describe('isWhatsappEnabled', () => {
    it('is OFF at launch with no credentials and no override', () => {
      expect(isWhatsappEnabled({})).toBe(false);
    });

    it('auto-enables once the Twilio WhatsApp credentials are all present', () => {
      expect(isWhatsappEnabled(TWILIO_WHATSAPP_ENV)).toBe(true);
    });

    it('lets an explicit override win either direction', () => {
      expect(isWhatsappEnabled({ NOTIFICATIONS_WHATSAPP_ENABLED: 'true' })).toBe(true);
      expect(
        isWhatsappEnabled({ ...TWILIO_WHATSAPP_ENV, NOTIFICATIONS_WHATSAPP_ENABLED: 'false' }),
      ).toBe(false);
      expect(isWhatsappEnabled({ NOTIFICATIONS_WHATSAPP_ENABLED: '1' })).toBe(false);
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

    it('seeds SMS and WhatsApp disabled because both channels are deferred', () => {
      const sms = rows.filter((r) => r.channel === NotificationChannel.SMS);
      const whatsapp = rows.filter((r) => r.channel === NotificationChannel.WHATSAPP);
      expect(sms.every((r) => r.enabled === false)).toBe(true);
      expect(whatsapp.every((r) => r.enabled === false)).toBe(true);
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
