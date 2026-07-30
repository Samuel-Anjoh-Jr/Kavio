import { NotificationCategory, NotificationChannel } from '@kavio/database';
import type { Prisma } from '@kavio/database';

/** DI token carrying the resolved channel priority into the dispatcher. */
export const NOTIFICATION_CHANNEL_PRIORITY = Symbol('NOTIFICATION_CHANNEL_PRIORITY');

/**
 * Configurable channel priority (SRS §17: Push → Email → SMS when enabled).
 * The dispatcher walks this order and delivers on every channel that is enabled,
 * permitted by preferences, supported by the template, and reachable.
 * Override with NOTIFICATIONS_CHANNEL_PRIORITY="EMAIL,WEB_PUSH".
 *
 * IN_APP leads: the inbox is the one channel that cannot fail for want of a
 * subscription or a mailbox, so it is written first and the outward channels
 * follow. A user who has denied push and never opens email still finds the
 * notice waiting in the Notification Center (NOT-02).
 */
const DEFAULT_CHANNEL_PRIORITY: NotificationChannel[] = [
  NotificationChannel.IN_APP,
  NotificationChannel.WEB_PUSH,
  NotificationChannel.EMAIL,
  NotificationChannel.SMS,
  NotificationChannel.WHATSAPP,
];

export function getChannelPriority(env: NodeJS.ProcessEnv = process.env): NotificationChannel[] {
  const raw = env.NOTIFICATIONS_CHANNEL_PRIORITY?.trim();
  if (!raw) {
    return [...DEFAULT_CHANNEL_PRIORITY];
  }

  const parsed = raw
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter((part): part is NotificationChannel =>
      Object.values(NotificationChannel).includes(part as NotificationChannel),
    );

  return parsed.length > 0 ? parsed : [...DEFAULT_CHANNEL_PRIORITY];
}

/**
 * Twilio backs both the SMS and WhatsApp channels — one account, two "From"
 * numbers. Each channel is considered configured only once every value it
 * needs is present, so a half-filled .env (e.g. the account SID pasted but not
 * the WhatsApp sender) stays OFF rather than failing at send time.
 */
export function hasTwilioSmsConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_SMS_FROM_NUMBER);
}

export function hasTwilioWhatsappConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM_NUMBER,
  );
}

export type SmsProviderName = 'stub' | 'twilio';
export type WhatsappProviderName = 'stub' | 'twilio';

export function getSmsProviderName(env: NodeJS.ProcessEnv = process.env): SmsProviderName {
  return hasTwilioSmsConfig(env) ? 'twilio' : 'stub';
}

export function getWhatsappProviderName(
  env: NodeJS.ProcessEnv = process.env,
): WhatsappProviderName {
  return hasTwilioWhatsappConfig(env) ? 'twilio' : 'stub';
}

/**
 * SMS feature flag. OFF at launch, same as the email channel's console→resend
 * switch: an explicit "true"/"false" always wins, and with neither set it
 * auto-enables the moment the Twilio SMS credentials below are all present —
 * no separate flag to remember once the values are filled in.
 */
export function isSmsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = env.NOTIFICATIONS_SMS_ENABLED;
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return hasTwilioSmsConfig(env);
}

/**
 * WhatsApp feature flag. Same posture as SMS: an explicit override always
 * wins, otherwise it auto-enables once the Twilio WhatsApp credentials are
 * all present.
 */
export function isWhatsappEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = env.NOTIFICATIONS_WHATSAPP_ENABLED;
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return hasTwilioWhatsappConfig(env);
}

/**
 * Which email provider backs the EMAIL channel. "console" prints a branded
 * preview to the terminal (local OTP + dev), "resend" delivers for real.
 * Defaults to console unless a RESEND_API_KEY is present in production.
 */
export type EmailProviderName = 'console' | 'resend';

export function getEmailProviderName(env: NodeJS.ProcessEnv = process.env): EmailProviderName {
  const explicit = env.NOTIFICATIONS_EMAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === 'console' || explicit === 'resend') {
    return explicit;
  }
  return env.RESEND_API_KEY ? 'resend' : 'console';
}

export function getEmailFromAddress(env: NodeJS.ProcessEnv = process.env): string {
  return env.NOTIFICATIONS_EMAIL_FROM?.trim() || 'Kavio <no-reply@kavio.cm>';
}

/** Base URL used to build deep links in templates. */
export function getAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const unwrapped = env.APP_BASE_URL?.trim()
    .replace(/^["']|["']$/g, '')
    .trim();
  return (unwrapped || 'https://kavio.cm').replace(/\/$/, '');
}

/**
 * Categories the Notification Center's "Important" filter shows (NOT-02).
 *
 * Money, safety, disputes, account security and verification outcomes are the
 * notices a user must not scroll past; everything else is routine traffic. Kept
 * as a category set rather than a per-template flag so a new template inherits
 * the right weight without anyone remembering to mark it.
 */
const IMPORTANT_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  NotificationCategory.SECURITY,
  NotificationCategory.PAYMENTS,
  NotificationCategory.DISPUTES,
  NotificationCategory.SAFETY,
  NotificationCategory.TRUST,
]);

export function isImportantCategory(category: NotificationCategory): boolean {
  return IMPORTANT_CATEGORIES.has(category);
}

// ─────────────────────────────────────────────────────────────────────────────
// Default preferences, seeded at user creation (SRS §26.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Channel × category defaults for a brand-new identity. SMS and WHATSAPP rows
 * are seeded disabled because both channels are deferred; a user who has never
 * touched their settings therefore sees nothing change when either flag is
 * flipped platform-wide. SECURITY is seeded enabled for completeness, but
 * security notices bypass this table entirely and always go by email.
 */
const OPT_OUT_BY_DEFAULT: ReadonlySet<NotificationCategory> = new Set([
  NotificationCategory.MARKETING,
]);

const DEFERRED_CHANNELS: ReadonlySet<NotificationChannel> = new Set([
  NotificationChannel.SMS,
  NotificationChannel.WHATSAPP,
]);

export function buildDefaultPreferences(
  userId: string,
): Prisma.NotificationPreferenceCreateManyInput[] {
  const rows: Prisma.NotificationPreferenceCreateManyInput[] = [];

  for (const channel of Object.values(NotificationChannel)) {
    for (const category of Object.values(NotificationCategory)) {
      rows.push({
        userId,
        channel,
        category,
        enabled: !DEFERRED_CHANNELS.has(channel) && !OPT_OUT_BY_DEFAULT.has(category),
      });
    }
  }

  return rows;
}
