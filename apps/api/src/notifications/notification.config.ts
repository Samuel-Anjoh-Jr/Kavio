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
 * SMS feature flag. OFF at launch: the provider is registered and fully wired,
 * but skipped until this flips (SRS §17, launch constraint). Flipping it to
 * "true" routes SMS-capable templates to the stub with zero call-site changes.
 */
export function isSmsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NOTIFICATIONS_SMS_ENABLED === 'true';
}

/**
 * WhatsApp feature flag. Same launch posture as SMS: registered and fully
 * wired, but OFF until a Business API vendor (e.g. 360dialog, Twilio) is
 * connected and its credentials are set. Flipping this on routes
 * WhatsApp-capable templates to the stub with zero call-site changes, exactly
 * like the SMS flip.
 */
export function isWhatsappEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NOTIFICATIONS_WHATSAPP_ENABLED === 'true';
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
