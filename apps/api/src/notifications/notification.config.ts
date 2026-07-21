import { NotificationCategory, NotificationChannel } from '@trustpro/database';
import type { Prisma } from '@trustpro/database';

/** DI token carrying the resolved channel priority into the dispatcher. */
export const NOTIFICATION_CHANNEL_PRIORITY = Symbol('NOTIFICATION_CHANNEL_PRIORITY');

/**
 * Configurable channel priority (SRS §17: Push → Email → SMS when enabled).
 * The dispatcher walks this order and delivers on every channel that is enabled,
 * permitted by preferences, supported by the template, and reachable.
 * Override with NOTIFICATIONS_CHANNEL_PRIORITY="EMAIL,WEB_PUSH".
 */
const DEFAULT_CHANNEL_PRIORITY: NotificationChannel[] = [
  NotificationChannel.WEB_PUSH,
  NotificationChannel.EMAIL,
  NotificationChannel.SMS,
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
  return env.NOTIFICATIONS_EMAIL_FROM?.trim() || 'TrustPro <no-reply@trustpro.cm>';
}

/** Base URL used to build deep links in templates. */
export function getAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.APP_BASE_URL?.trim() || 'https://trustpro.cm').replace(/\/$/, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Default preferences, seeded at user creation (SRS §26.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Channel × category defaults for a brand-new identity. SMS rows are seeded
 * disabled because the channel is deferred; a user who has never touched their
 * settings therefore sees nothing change when the flag is flipped platform-wide.
 * SECURITY is seeded enabled for completeness, but security notices bypass this
 * table entirely and always go by email.
 */
const OPT_OUT_BY_DEFAULT: ReadonlySet<NotificationCategory> = new Set([
  NotificationCategory.MARKETING,
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
        enabled: channel !== NotificationChannel.SMS && !OPT_OUT_BY_DEFAULT.has(category),
      });
    }
  }

  return rows;
}
