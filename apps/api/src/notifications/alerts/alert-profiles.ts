/**
 * Alert profiles for Kavio pushes: how loud, how long, how persistent.
 *
 * Same contract as ASK-O and ASK-O Eats, keyed by notification templateKey.
 * Admins tune it in the console (SystemSetting "notifications.alerts" — a
 * partial JSON override — and "notifications.ringLoopSeconds"); everything
 * is clamped/merged here so a bad save can never silence a booking ring.
 *
 *   ring   – phone-call behaviour: looping ringtone + repeating vibration,
 *            call-style banner, then the escalation ladder until someone acts.
 *            For the moments a worker must act now: a client FUNDED a booking
 *            (escrow paid, waiting for the worker to accept), a direct job
 *            invitation, an SOS.
 *   once   – one branded sound. Money, quotes, messages, trust milestones.
 *   silent – shade/inbox only (marketing).
 */

export type AlertTier = 'ring' | 'once' | 'silent';

export const ALERT_SOUNDS = [
  'ring_new_order',
  'ring_new_job',
  'new_order',
  'available_job',
  'payment_success',
  'wallet_update',
  'delivery_confirmation',
  'order_update',
  'generic_notification',
] as const;
export type AlertSound = (typeof ALERT_SOUNDS)[number];

export type EscalationChannel = 'push' | 'whatsapp' | 'sms' | 'voice';

export interface TemplateAlertSettings {
  tier: AlertTier;
  sound: AlertSound;
  vibrate: boolean;
  escalate: boolean;
  loopSeconds?: number;
}

export interface AlertSettings {
  ringLoopSeconds: number;
  templates: Record<string, TemplateAlertSettings>;
  escalation: {
    enabled: boolean;
    steps: { afterSeconds: number; channel: EscalationChannel }[];
    channels: {
      push: { enabled: boolean };
      whatsapp: { enabled: boolean; provider: 'twilio' | 'meta' };
      sms: { enabled: boolean; provider: 'twilio' | 'africastalking' };
      voice: { enabled: boolean; provider: 'twilio' | 'africastalking' };
    };
  };
}

/** Templates that ring by default. Everything else is "once". */
const RING_DEFAULTS: Record<string, TemplateAlertSettings> = {
  // The client paid into escrow: the worker should accept the booking now.
  'payment.received': { tier: 'ring', sound: 'ring_new_order', vibrate: true, escalate: true },
  // A client picked this worker for a job: answer before others do.
  'job.invitation_received': {
    tier: 'ring',
    sound: 'ring_new_job',
    vibrate: true,
    escalate: false,
  },
  'safety.sos_triggered': { tier: 'ring', sound: 'ring_new_order', vibrate: true, escalate: false },
};

/** One-time sound per template family (the brand set, matched to meaning). */
function onceSoundFor(templateKey: string): AlertSound {
  if (templateKey === 'escrow.released' || templateKey.startsWith('payment.'))
    return 'payment_success';
  if (templateKey === 'escrow.refunded') return 'wallet_update';
  if (templateKey === 'escrow.work_completed' || templateKey === 'escrow.work_accepted')
    return 'delivery_confirmation';
  if (
    templateKey.startsWith('quote.') ||
    templateKey.startsWith('job.') ||
    templateKey.startsWith('escrow.')
  )
    return 'order_update';
  return 'generic_notification';
}

export function defaultTemplateProfile(
  templateKey: string,
  category?: string,
): TemplateAlertSettings {
  const ring = RING_DEFAULTS[templateKey];
  if (ring) return { ...ring };
  if (category === 'MARKETING')
    return { tier: 'silent', sound: 'generic_notification', vibrate: false, escalate: false };
  return {
    tier: 'once',
    sound: onceSoundFor(templateKey),
    vibrate: !templateKey.startsWith('trust.') && !templateKey.startsWith('review.'),
    escalate: false,
  };
}

export const DEFAULT_ESCALATION: AlertSettings['escalation'] = {
  enabled: true,
  // Bookings are less minute-critical than food orders: a gentler ladder.
  steps: [
    { afterSeconds: 60, channel: 'push' },
    { afterSeconds: 300, channel: 'whatsapp' },
    { afterSeconds: 600, channel: 'sms' },
    { afterSeconds: 900, channel: 'voice' },
  ],
  channels: {
    push: { enabled: true },
    whatsapp: { enabled: false, provider: 'twilio' },
    sms: { enabled: false, provider: 'twilio' },
    voice: { enabled: false, provider: 'twilio' },
  },
};

const TIERS: AlertTier[] = ['ring', 'once', 'silent'];
const CHANNELS: EscalationChannel[] = ['push', 'whatsapp', 'sms', 'voice'];
const clampLoop = (n: unknown, fallback = 30) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(Math.min(120, Math.max(5, v))) : fallback;
};

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
const isTier = (v: unknown): v is AlertTier => TIERS.includes(v as AlertTier);
const isSound = (v: unknown): v is AlertSound => (ALERT_SOUNDS as readonly unknown[]).includes(v);
const isChannel = (v: unknown): v is EscalationChannel => CHANNELS.includes(v as EscalationChannel);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/** Merge stored (partial, possibly stale) settings over the defaults. */
export function normalizeAlertSettings(raw: unknown, ringLoopSeconds?: unknown): AlertSettings {
  const src = asObj(raw);
  const templates: Record<string, TemplateAlertSettings> = {};
  for (const [key, rawValue] of Object.entries(asObj(src.templates))) {
    const value = asObj(rawValue);
    if (!/^[a-z_]+\.[a-z_]+$/.test(key) || Object.keys(value).length === 0) continue;
    const def = defaultTemplateProfile(key);
    const loop = value.loopSeconds;
    templates[key] = {
      tier: isTier(value.tier) ? value.tier : def.tier,
      sound: isSound(value.sound) ? value.sound : def.sound,
      vibrate: bool(value.vibrate, def.vibrate),
      escalate: bool(value.escalate, def.escalate),
      ...(loop !== undefined && loop !== null && loop !== ''
        ? { loopSeconds: clampLoop(loop) }
        : {}),
    };
  }
  const esc = asObj(src.escalation);
  const ch = asObj(esc.channels);
  const whatsapp = asObj(ch.whatsapp);
  const sms = asObj(ch.sms);
  const voice = asObj(ch.voice);
  const d = DEFAULT_ESCALATION;
  const steps = Array.isArray(esc.steps)
    ? esc.steps
        .map(asObj)
        .filter((step) => isChannel(step.channel) && Number.isFinite(Number(step.afterSeconds)))
        .map((step) => ({
          channel: step.channel as EscalationChannel,
          afterSeconds: Math.round(Math.min(86_400, Math.max(5, Number(step.afterSeconds)))),
        }))
        .sort((a, b) => a.afterSeconds - b.afterSeconds)
    : d.steps;
  return {
    ringLoopSeconds: clampLoop(ringLoopSeconds ?? src.ringLoopSeconds, 30),
    templates,
    escalation: {
      enabled: bool(esc.enabled, d.enabled),
      steps,
      channels: {
        push: { enabled: bool(asObj(ch.push).enabled, d.channels.push.enabled) },
        whatsapp: {
          enabled: bool(whatsapp.enabled, false),
          provider: whatsapp.provider === 'meta' ? 'meta' : 'twilio',
        },
        sms: {
          enabled: bool(sms.enabled, false),
          provider: sms.provider === 'africastalking' ? 'africastalking' : 'twilio',
        },
        voice: {
          enabled: bool(voice.enabled, false),
          provider: voice.provider === 'africastalking' ? 'africastalking' : 'twilio',
        },
      },
    },
  };
}

export interface ResolvedAlert {
  event: string;
  tier: AlertTier;
  sound: AlertSound;
  vibrate: boolean;
  loopSeconds: number;
  escalate: boolean;
  androidChannelId: string;
  vibration: number[];
}

function androidChannelFor(tier: AlertTier, sound: AlertSound): string {
  if (tier === 'ring') return sound === 'ring_new_job' ? 'ring_jobs_v2' : 'ring_orders_v2';
  if (tier === 'silent') return 'live_updates_v2';
  switch (sound) {
    case 'payment_success':
      return 'payments_v2';
    case 'wallet_update':
      return 'wallet_v2';
    case 'delivery_confirmation':
      return 'delivered_v2';
    case 'order_update':
      return 'order_updates_v2';
    default:
      return 'general_v2';
  }
}

/**
 * The effective profile for one push. A user who set the category's sound to
 * "silent" in their own preferences keeps silence (except for rings and SOS).
 */
export function resolveAlert(
  settings: AlertSettings,
  templateKey: string,
  category?: string,
  userSoundKey?: string | null,
): ResolvedAlert {
  const profile = settings.templates[templateKey] ?? defaultTemplateProfile(templateKey, category);
  const tier: AlertTier =
    profile.tier !== 'ring' && userSoundKey === 'silent' ? 'silent' : profile.tier;
  return {
    event: templateKey,
    tier,
    sound: profile.sound,
    vibrate: profile.vibrate && tier !== 'silent',
    loopSeconds: tier === 'ring' ? clampLoop(profile.loopSeconds ?? settings.ringLoopSeconds) : 0,
    escalate: tier === 'ring' && profile.escalate && settings.escalation.enabled,
    androidChannelId: androidChannelFor(tier, profile.sound),
    vibration:
      profile.vibrate && tier !== 'silent'
        ? tier === 'ring'
          ? [0, 900, 400, 900, 400, 900, 1200]
          : [0, 250, 120, 250]
        : [],
  };
}

export function alertActions(
  templateKey: string,
  locale: 'en' | 'fr',
): { id: string; title: string }[] {
  const fr = locale === 'fr';
  if (templateKey === 'payment.received') {
    return [
      { id: 'accept', title: fr ? 'Voir la réservation' : 'View booking' },
      { id: 'decline', title: fr ? 'Plus tard' : 'Later' },
    ];
  }
  if (templateKey === 'job.invitation_received') {
    return [
      { id: 'accept', title: fr ? 'Voir le travail' : 'View job' },
      { id: 'decline', title: fr ? 'Plus tard' : 'Later' },
    ];
  }
  return [{ id: 'open', title: fr ? 'Ouvrir' : 'Open' }];
}
