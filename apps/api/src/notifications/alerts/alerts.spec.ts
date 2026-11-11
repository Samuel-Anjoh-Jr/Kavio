import { buildAlertMessages } from './alert-fcm';
import {
  alertActions,
  defaultTemplateProfile,
  normalizeAlertSettings,
  resolveAlert,
} from './alert-profiles';
import {
  TwilioSmsProvider,
  TwilioWhatsappProvider,
  pickProvider,
  toE164Cameroon,
} from './escalation-providers';

describe('Kavio alert profiles', () => {
  const settings = normalizeAlertSettings({});

  it('rings the worker when a client funds a booking or invites them', () => {
    expect(resolveAlert(settings, 'payment.received')).toMatchObject({
      tier: 'ring',
      sound: 'ring_new_order',
      loopSeconds: 30,
      escalate: true,
    });
    expect(resolveAlert(settings, 'job.invitation_received')).toMatchObject({
      tier: 'ring',
      sound: 'ring_new_job',
      escalate: false,
    });
  });

  it('plays one branded sound for money, quotes and messages', () => {
    expect(resolveAlert(settings, 'escrow.released')).toMatchObject({
      tier: 'once',
      sound: 'payment_success',
    });
    expect(resolveAlert(settings, 'escrow.refunded').sound).toBe('wallet_update');
    expect(resolveAlert(settings, 'quote.received').sound).toBe('order_update');
    expect(resolveAlert(settings, 'message.received').sound).toBe('generic_notification');
    expect(defaultTemplateProfile('admin.announcement_published', 'MARKETING').tier).toBe('silent');
  });

  it("keeps a user's 'silent' sound choice, except for rings", () => {
    expect(resolveAlert(settings, 'quote.received', 'QUOTES', 'silent').tier).toBe('silent');
    expect(resolveAlert(settings, 'payment.received', 'PAYMENTS', 'silent').tier).toBe('ring');
  });

  it('applies admin overrides from the console and clamps them', () => {
    const s = normalizeAlertSettings(
      {
        templates: {
          'quote.accepted': { tier: 'ring', loopSeconds: 999 },
          'bad key': { tier: 'ring' },
        },
      },
      2,
    );
    expect(s.ringLoopSeconds).toBe(5);
    expect(resolveAlert(s, 'quote.accepted')).toMatchObject({ tier: 'ring', loopSeconds: 120 });
    expect(Object.keys(s.templates)).toEqual(['quote.accepted']);
    expect(s.escalation.channels.voice.enabled).toBe(false);
  });

  it('labels the banner buttons in French and English', () => {
    expect(alertActions('payment.received', 'fr')[0]).toEqual({
      id: 'accept',
      title: 'Voir la réservation',
    });
    expect(alertActions('message.received', 'en')).toEqual([{ id: 'open', title: 'Open' }]);
  });

  it('sends data-only rings to native builds and the indigo accent', () => {
    const [msg] = buildAlertMessages(
      [{ token: 't', platform: 'android', alertsVersion: 2 }],
      resolveAlert(settings, 'payment.received'),
      {
        title: 'Réservation payée',
        body: 'Acceptez-la',
        data: {},
        path: '/fr/app/jobs/1',
        tag: 'booking-1',
      },
    ) as unknown as { data: Record<string, string>; notification?: unknown }[];
    expect(msg?.notification).toBeUndefined();
    expect(msg?.data).toMatchObject({
      kv: '2',
      tier: 'ring',
      accent: '#3D5AFE',
      channelId: 'ring_orders_v2',
    });
  });
});

describe('Kavio escalation providers', () => {
  it("accepts Kavio's existing *_NUMBER Twilio env names", () => {
    const env = {
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 't',
      TWILIO_SMS_FROM_NUMBER: '+1555',
      TWILIO_WHATSAPP_FROM_NUMBER: '+1556',
    };
    expect(new TwilioSmsProvider(env).configured()).toBe(true);
    expect(new TwilioWhatsappProvider(env).configured()).toBe(true);
    expect(pickProvider('voice', 'twilio', env)).toBeNull();
  });

  it('parses provider responses without trusting their shape', async () => {
    const realFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 400,
        text: () => Promise.resolve('{"code":21211,"message":"bad To"}'),
      }),
    ) as unknown as typeof fetch;
    const result = await new TwilioSmsProvider({
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 't',
      TWILIO_SMS_FROM: '+1555',
    }).send({
      to: '+237670000001',
      locale: 'fr',
      text: 'x',
      templateVars: ['a', 'b', 'c'],
      voiceText: 'v',
    });
    global.fetch = realFetch;
    expect(result).toEqual({ ok: false, error: 'twilio 400: 21211 bad To' });
  });

  it('normalises Cameroon numbers to E.164', () => {
    expect(toE164Cameroon('670 00 00 01')).toBe('+237670000001');
    expect(toE164Cameroon('abc')).toBeNull();
  });
});
