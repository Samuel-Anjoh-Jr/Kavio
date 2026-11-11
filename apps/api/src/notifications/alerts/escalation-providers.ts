/**
 * WhatsApp / SMS / voice providers for the alert escalation ladder.
 *
 * Plain fetch, no SDKs: each adapter is ~30 lines and only needs its keys in
 * the environment (see docs/notifications/ESCALATION_SETUP.md). A provider
 * whose keys are missing reports `configured: false`; the admin screen shows
 * that and the ladder skips it, so nothing is sent until you add keys AND
 * switch the channel on.
 *
 * Secrets never reach logs: only the provider name, channel, the last 3
 * digits of the destination and the provider's message/call id are logged.
 */

import Redis from 'ioredis';

export type EscalationChannelName = 'whatsapp' | 'sms' | 'voice';

export interface EscalationMessage {
  /** E.164, e.g. +237670000000 */
  to: string;
  locale: 'en' | 'fr';
  /** Short text for WhatsApp/SMS. */
  text: string;
  /** Template variables for WhatsApp templates: [title, body, link]. */
  templateVars: [string, string, string];
  /** Spoken text for voice calls. */
  voiceText: string;
}

export interface EscalationResult {
  ok: boolean;
  providerRef?: string;
  error?: string;
}

export interface EscalationProvider {
  readonly name: string;
  readonly channel: EscalationChannelName;
  configured(): boolean;
  send(message: EscalationMessage): Promise<EscalationResult>;
}

type Env = Record<string, string | undefined>;

const TIMEOUT_MS = 10_000;

async function post(
  url: string,
  init: { headers: Record<string, string>; body: string },
): Promise<{ status: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      ...init,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/** Reads a nested value from an untyped JSON response: path(json, 'a', 0, 'b'). */
function path(json: unknown, ...keys: (string | number)[]): unknown {
  let cur: unknown = json;
  for (const key of keys) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

const text = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : '';

function form(data: Record<string, string>): string {
  return new URLSearchParams(data).toString();
}

function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
      })[c]!,
  );
}

// ── Twilio: one account covers SMS, WhatsApp and voice (recommended) ───────

function twilioAuth(env: Env): string | null {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

function twilioResult(status: number, json: unknown): EscalationResult {
  if (status >= 200 && status < 300)
    return { ok: true, providerRef: text(path(json, 'sid')) || undefined };
  return {
    ok: false,
    error: `twilio ${status}: ${text(path(json, 'code'))} ${text(path(json, 'message'))}`.trim(),
  };
}

export class TwilioSmsProvider implements EscalationProvider {
  readonly name = 'twilio';
  readonly channel = 'sms' as const;
  constructor(private readonly env: Env = process.env) {}
  configured() {
    return Boolean(
      twilioAuth(this.env) &&
      (this.env.TWILIO_SMS_FROM ||
        this.env.TWILIO_SMS_FROM_NUMBER ||
        this.env.TWILIO_MESSAGING_SERVICE_SID),
    );
  }
  async send(m: EscalationMessage) {
    const sid = this.env.TWILIO_ACCOUNT_SID!;
    const sender: Record<string, string> = this.env.TWILIO_MESSAGING_SERVICE_SID
      ? { MessagingServiceSid: this.env.TWILIO_MESSAGING_SERVICE_SID }
      : { From: (this.env.TWILIO_SMS_FROM || this.env.TWILIO_SMS_FROM_NUMBER)! };
    const { status, json } = await post(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        headers: {
          Authorization: twilioAuth(this.env)!,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form({ To: m.to, Body: m.text.slice(0, 600), ...sender }),
      },
    );
    return twilioResult(status, json);
  }
}

export class TwilioWhatsappProvider implements EscalationProvider {
  readonly name = 'twilio';
  readonly channel = 'whatsapp' as const;
  constructor(private readonly env: Env = process.env) {}
  configured() {
    return Boolean(
      twilioAuth(this.env) &&
      (this.env.TWILIO_WHATSAPP_FROM || this.env.TWILIO_WHATSAPP_FROM_NUMBER),
    );
  }
  async send(m: EscalationMessage) {
    const sid = this.env.TWILIO_ACCOUNT_SID!;
    // Kavio's existing env names end in _NUMBER (notification.config.ts).
    const raw = (this.env.TWILIO_WHATSAPP_FROM || this.env.TWILIO_WHATSAPP_FROM_NUMBER)!;
    const from = raw.startsWith('whatsapp:') ? raw : `whatsapp:${raw}`;
    // Business-initiated WhatsApp needs an approved template (Content SID).
    // Without one, Twilio only delivers inside a 24 h customer-service window.
    const contentSid =
      m.locale === 'fr'
        ? this.env.TWILIO_WHATSAPP_CONTENT_SID_FR || this.env.TWILIO_WHATSAPP_CONTENT_SID
        : this.env.TWILIO_WHATSAPP_CONTENT_SID_EN || this.env.TWILIO_WHATSAPP_CONTENT_SID;
    const payload: Record<string, string> = {
      To: `whatsapp:${m.to}`,
      From: from,
    };
    if (contentSid) {
      payload.ContentSid = contentSid;
      payload.ContentVariables = JSON.stringify({
        '1': m.templateVars[0],
        '2': m.templateVars[1],
        '3': m.templateVars[2],
      });
    } else {
      payload.Body = m.text.slice(0, 1000);
    }
    const { status, json } = await post(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        headers: {
          Authorization: twilioAuth(this.env)!,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form(payload),
      },
    );
    return twilioResult(status, json);
  }
}

export class TwilioVoiceProvider implements EscalationProvider {
  readonly name = 'twilio';
  readonly channel = 'voice' as const;
  constructor(private readonly env: Env = process.env) {}
  configured() {
    return Boolean(twilioAuth(this.env) && this.env.TWILIO_VOICE_FROM);
  }
  async send(m: EscalationMessage) {
    const sid = this.env.TWILIO_ACCOUNT_SID!;
    const lang = m.locale === 'fr' ? 'fr-FR' : 'en-US';
    const say = `<Say language="${lang}">${escapeXml(m.voiceText)}</Say>`;
    // Said twice with a pause, so someone who answers late still hears it.
    const twiml = `<Response>${say}<Pause length="1"/>${say}</Response>`;
    const { status, json } = await post(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`,
      {
        headers: {
          Authorization: twilioAuth(this.env)!,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form({
          To: m.to,
          From: this.env.TWILIO_VOICE_FROM!,
          Twiml: twiml,
          Timeout: '30',
        }),
      },
    );
    return twilioResult(status, json);
  }
}

// ── Meta WhatsApp Cloud API (cheapest WhatsApp; needs an approved template) ─

export class MetaWhatsappProvider implements EscalationProvider {
  readonly name = 'meta';
  readonly channel = 'whatsapp' as const;
  constructor(private readonly env: Env = process.env) {}
  configured() {
    return Boolean(
      this.env.META_WHATSAPP_TOKEN &&
      this.env.META_WHATSAPP_PHONE_NUMBER_ID &&
      this.env.META_WHATSAPP_TEMPLATE,
    );
  }
  async send(m: EscalationMessage) {
    const version = this.env.META_GRAPH_VERSION || 'v21.0';
    const { status, json } = await post(
      `https://graph.facebook.com/${version}/${this.env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        headers: {
          Authorization: `Bearer ${this.env.META_WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: m.to.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: this.env.META_WHATSAPP_TEMPLATE,
            language: { code: m.locale === 'fr' ? 'fr' : 'en' },
            components: [
              {
                type: 'body',
                parameters: m.templateVars.map((text) => ({
                  type: 'text',
                  text: text.slice(0, 300),
                })),
              },
            ],
          },
        }),
      },
    );
    if (status >= 200 && status < 300)
      return { ok: true, providerRef: text(path(json, 'messages', 0, 'id')) || undefined };
    return {
      ok: false,
      error: `meta ${status}: ${text(path(json, 'error', 'message'))}`.trim(),
    };
  }
}

// ── Africa's Talking (check Cameroon coverage for your account first) ──────

export class AfricasTalkingSmsProvider implements EscalationProvider {
  readonly name = 'africastalking';
  readonly channel = 'sms' as const;
  constructor(private readonly env: Env = process.env) {}
  configured() {
    return Boolean(this.env.AFRICASTALKING_USERNAME && this.env.AFRICASTALKING_API_KEY);
  }
  async send(m: EscalationMessage) {
    const body: Record<string, string> = {
      username: this.env.AFRICASTALKING_USERNAME!,
      to: m.to,
      message: m.text.slice(0, 600),
    };
    if (this.env.AFRICASTALKING_SMS_FROM) body.from = this.env.AFRICASTALKING_SMS_FROM;
    const { status, json } = await post('https://api.africastalking.com/version1/messaging', {
      headers: {
        apiKey: this.env.AFRICASTALKING_API_KEY!,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form(body),
    });
    const recipientStatus = text(path(json, 'SMSMessageData', 'Recipients', 0, 'status'));
    if (status < 300 && /success/i.test(recipientStatus)) {
      return {
        ok: true,
        providerRef: text(path(json, 'SMSMessageData', 'Recipients', 0, 'messageId')) || undefined,
      };
    }
    return {
      ok: false,
      error: `africastalking ${status}: ${recipientStatus || text(path(json, 'SMSMessageData', 'Message'))}`,
    };
  }
}

/**
 * Africa's Talking voice asks OUR server what to say when the call connects,
 * so the spoken text is parked (keyed by destination) for the callback at
 * POST /alerts/voice/africastalking. It is stored in Redis (10 min) so any API
 * replica can answer the callback; the in-memory map is only the fallback
 * when Redis is unavailable.
 */
export const pendingVoiceScripts = new Map<string, { text: string; lang: string; at: number }>();

type VoiceScript = { text: string; lang: string; at: number };
const VOICE_SCRIPT_TTL_S = 600;
let voiceRedis: Redis | null | undefined;
function voiceScriptRedis(): Redis | null {
  if (voiceRedis === undefined) {
    const url = process.env.REDIS_URL;
    voiceRedis = url
      ? new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
      : null;
    voiceRedis?.on('error', () => undefined);
  }
  return voiceRedis;
}
const voiceKey = (to: string) => `alerts:voice-script:${to}`;

export async function storeVoiceScript(to: string, script: VoiceScript): Promise<void> {
  pendingVoiceScripts.set(to, script);
  for (const [k, v] of pendingVoiceScripts)
    if (Date.now() - v.at > VOICE_SCRIPT_TTL_S * 1000) pendingVoiceScripts.delete(k);
  try {
    await voiceScriptRedis()?.set(voiceKey(to), JSON.stringify(script), 'EX', VOICE_SCRIPT_TTL_S);
  } catch {
    // Memory copy above still serves a single-replica deployment.
  }
}

export async function loadVoiceScript(to: string): Promise<VoiceScript | undefined> {
  try {
    const raw = await voiceScriptRedis()?.get(voiceKey(to));
    if (raw) return JSON.parse(raw) as VoiceScript;
  } catch {
    // Fall back to this replica's memory.
  }
  return pendingVoiceScripts.get(to);
}

export class AfricasTalkingVoiceProvider implements EscalationProvider {
  readonly name = 'africastalking';
  readonly channel = 'voice' as const;
  constructor(private readonly env: Env = process.env) {}
  configured() {
    return Boolean(
      this.env.AFRICASTALKING_USERNAME &&
      this.env.AFRICASTALKING_API_KEY &&
      this.env.AFRICASTALKING_VOICE_FROM,
    );
  }
  async send(m: EscalationMessage) {
    await storeVoiceScript(m.to, {
      text: m.voiceText,
      lang: m.locale === 'fr' ? 'fr-FR' : 'en-US',
      at: Date.now(),
    });
    const { status, json } = await post('https://voice.africastalking.com/call', {
      headers: {
        apiKey: this.env.AFRICASTALKING_API_KEY!,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form({
        username: this.env.AFRICASTALKING_USERNAME!,
        from: this.env.AFRICASTALKING_VOICE_FROM!,
        to: m.to,
      }),
    });
    const entryStatus = text(path(json, 'entries', 0, 'status'));
    if (status < 300 && /queued/i.test(entryStatus))
      return { ok: true, providerRef: text(path(json, 'entries', 0, 'sessionId')) || undefined };
    return {
      ok: false,
      error: `africastalking-voice ${status}: ${entryStatus || text(path(json, 'errorMessage'))}`,
    };
  }
}

/** The XML Africa's Talking expects back from the voice callback. */
export function africasTalkingVoiceXml(script: { text: string; lang: string } | undefined): string {
  const text = script?.text ?? 'You have an urgent notification. Please open the app.';
  const say = `<Say voice="${script?.lang?.startsWith('fr') ? 'fr-FR-Standard-A' : 'en-US-Standard-C'}">${escapeXml(text)}</Say>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${say}${say}</Response>`;
}

export interface ProviderStatus {
  channel: EscalationChannelName;
  provider: string;
  configured: boolean;
}

/** Every adapter, so the admin screen can show which ones have keys. */
export function allEscalationProviders(env: Env = process.env): EscalationProvider[] {
  return [
    new TwilioWhatsappProvider(env),
    new MetaWhatsappProvider(env),
    new TwilioSmsProvider(env),
    new AfricasTalkingSmsProvider(env),
    new TwilioVoiceProvider(env),
    new AfricasTalkingVoiceProvider(env),
  ];
}

export function pickProvider(
  channel: EscalationChannelName,
  preferred: string,
  env: Env = process.env,
): EscalationProvider | null {
  const candidates = allEscalationProviders(env).filter((p) => p.channel === channel);
  return candidates.find((p) => p.name === preferred && p.configured()) ?? null;
}

/** "+237 6 70 12 34 56" / "670123456" → "+237670123456"; null when unusable. */
export function toE164Cameroon(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  const bare = digits.replace(/\D/g, '');
  if (/^237\d{9}$/.test(bare)) return `+${bare}`;
  if (/^6\d{8}$/.test(bare) || /^2\d{8}$/.test(bare)) return `+237${bare}`;
  return null;
}
