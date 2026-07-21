import { NotificationChannel } from '@trustpro/database';
import { LOCALES } from '../notification.types';
import {
  TEMPLATE_KEYS,
  getSupportedChannels,
  getTemplate,
  isTemplateKey,
  renderTemplate,
} from './template.registry';

describe('template registry', () => {
  it('exposes every template under a stable key', () => {
    expect(TEMPLATE_KEYS.length).toBeGreaterThan(0);
    expect(isTemplateKey('system.test_notification')).toBe(true);
    expect(isTemplateKey('nope.not.a.template')).toBe(false);
  });

  /**
   * EN/FR parity is a hard requirement (SYS-03, NFR-I18N-01). This guards the
   * whole store, so a future template cannot ship English-only.
   */
  it.each(TEMPLATE_KEYS)('%s has EN and FR copy for every channel it supports', (key) => {
    const channels = getSupportedChannels(key);
    expect(channels.length).toBeGreaterThan(0);

    for (const channel of channels) {
      for (const locale of LOCALES) {
        const rendered = renderTemplate(key, channel, locale, sampleVariables(key));
        expect(rendered).not.toBeNull();

        if (rendered?.channel === 'EMAIL') {
          expect(rendered.content.subject.trim().length).toBeGreaterThan(0);
          expect(rendered.content.html).toContain('<!doctype html>');
          expect(rendered.content.text.trim().length).toBeGreaterThan(0);
        } else if (rendered?.channel === 'WEB_PUSH') {
          expect(rendered.content.title.trim().length).toBeGreaterThan(0);
          expect(rendered.content.body.trim().length).toBeGreaterThan(0);
        } else if (rendered?.channel === 'SMS') {
          expect(rendered.content.text.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('renders distinct copy per locale', () => {
    const en = renderTemplate('account.welcome', NotificationChannel.EMAIL, 'en', { name: 'Awa' });
    const fr = renderTemplate('account.welcome', NotificationChannel.EMAIL, 'fr', { name: 'Awa' });

    expect(en?.channel).toBe('EMAIL');
    expect(fr?.channel).toBe('EMAIL');
    if (en?.channel === 'EMAIL' && fr?.channel === 'EMAIL') {
      expect(en.content.subject).not.toBe(fr.content.subject);
      expect(fr.content.html).toContain('lang="fr"');
    }
  });

  it('returns null for a channel the template has no content for', () => {
    // password_reset is email-only.
    expect(
      renderTemplate('auth.password_reset', NotificationChannel.SMS, 'en', {
        resetUrl: 'https://trustpro.cm/r/1',
        expiresInMinutes: 30,
      }),
    ).toBeNull();
  });

  it('marks the security-critical templates so they bypass preferences', () => {
    expect(getTemplate('auth.password_reset').securityCritical).toBe(true);
    expect(getTemplate('auth.new_device_login').securityCritical).toBe(true);
    expect(getTemplate('auth.otp_code').securityCritical).toBe(true);
    expect(getTemplate('account.welcome').securityCritical).toBeUndefined();
  });

  it('escapes interpolated values so template variables cannot inject markup', () => {
    const rendered = renderTemplate('account.welcome', NotificationChannel.EMAIL, 'en', {
      name: '<script>alert(1)</script>',
    });

    expect(rendered?.channel).toBe('EMAIL');
    if (rendered?.channel === 'EMAIL') {
      expect(rendered.content.html).not.toContain('<script>');
      expect(rendered.content.html).toContain('&lt;script&gt;');
    }
  });

  it('falls back to English rather than dropping a delivery on an unknown locale', () => {
    const rendered = renderTemplate(
      'system.test_notification',
      NotificationChannel.EMAIL,
      'de' as never,
      { message: 'hi' },
    );

    expect(rendered?.channel).toBe('EMAIL');
    if (rendered?.channel === 'EMAIL') {
      expect(rendered.content.subject).toBe('TrustPro test notification');
    }
  });
});

/** Representative variables per template, used to exercise every renderer. */
function sampleVariables(key: string): Record<string, unknown> {
  switch (key) {
    case 'system.test_notification':
      return { message: 'Dispatcher smoke test' };
    case 'account.welcome':
      return { name: 'Awa' };
    case 'auth.otp_code':
      return { code: '123456', expiresInMinutes: 10 };
    case 'auth.password_reset':
      return { resetUrl: 'https://trustpro.cm/reset/abc', expiresInMinutes: 30 };
    case 'auth.new_device_login':
      return {
        deviceName: 'Chrome on Android',
        occurredAt: '21 July 2026, 09:14',
        secureAccountUrl: 'https://trustpro.cm/settings/security',
      };
    case 'auth.password_changed':
      return { occurredAt: '21 July 2026, 09:14' };
    case 'auth.two_factor_changed':
      return { enabled: true };
    default:
      return {};
  }
}
