import type { NotificationCategory, NotificationChannel } from '@trustpro/database';

/** Supported UI/content locales. Every template ships both (SYS-03, NFR-I18N-01). */
export type Locale = 'en' | 'fr';

export const LOCALES: readonly Locale[] = ['en', 'fr'] as const;

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'en' || value === 'fr';
}

/** Falls back to English for any unknown/missing locale. */
export function resolveLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : 'en';
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendered content, one shape per channel
// ─────────────────────────────────────────────────────────────────────────────

export interface EmailContent {
  subject: string;
  html: string;
  /** Plain-text alternative; required so emails degrade on text-only clients. */
  text: string;
}

export interface WebPushContent {
  title: string;
  body: string;
  /** Deep link opened when the notification is clicked (P76/P77). */
  url?: string;
}

export interface SmsContent {
  text: string;
}

export type RenderedContent = EmailContent | WebPushContent | SmsContent;

/** Discriminated union so a provider can narrow to the content it understands. */
export type RenderedMessage =
  | { channel: 'EMAIL'; content: EmailContent }
  | { channel: 'WEB_PUSH'; content: WebPushContent }
  | { channel: 'SMS'; content: SmsContent };

// ─────────────────────────────────────────────────────────────────────────────
// The provider contract
// ─────────────────────────────────────────────────────────────────────────────

/** Who a delivery is addressed to, resolved once per dispatch by the dispatcher. */
export interface RecipientContext {
  userId: string | null;
  email: string | null;
  /** E.164 (+237…), normalised at capture so SMS flips on with no call-site change. */
  phone: string | null;
  locale: Locale;
  /** Web-push endpoints from the device registry (populated in P76). */
  pushEndpoints: string[];
}

/**
 * The NotificationChannel interface (SRS §17). Every delivery mechanism sits
 * behind this contract; the dispatcher never imports a concrete provider, so
 * adding or swapping a channel never touches business logic.
 */
export interface NotificationChannelProvider {
  /** The channel this provider serves. One provider is active per channel. */
  readonly channel: NotificationChannel;

  /** Stable provider identifier written to NotificationLog.provider (e.g. "resend"). */
  readonly providerName: string;

  /**
   * Whether this provider may be used right now. Backed by feature flags and
   * config presence — SMS returns false at launch (deferred, flag OFF).
   */
  isEnabled(): boolean;

  /**
   * The delivery address for this recipient, or null when the channel cannot
   * reach them (no email on file, no push subscription yet, …). A null recipient
   * makes the dispatcher skip the channel rather than fail the notification.
   */
  resolveRecipient(recipient: RecipientContext): string | null;

  /** Deliver. Throwing marks the attempt FAILED and lets BullMQ retry. */
  send(address: string, message: RenderedMessage): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue payload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What travels on the BullMQ "notifications" queue. Deliberately carries the
 * templateKey + variables rather than rendered content, so retries re-render
 * with the current template and nothing user-facing sits in Redis.
 */
export interface NotificationDeliveryJob {
  /** NotificationLog row created (PENDING) before enqueue; updated by the processor. */
  logId: string;
  channel: NotificationChannel;
  providerName: string;
  address: string;
  templateKey: string;
  category: NotificationCategory;
  locale: Locale;
  variables: Record<string, unknown>;
  userId: string | null;
  /** Correlates the delivery back to the request that triggered it. */
  requestId?: string;
}

export const NOTIFICATION_DELIVERY_JOB = 'notification.delivery';
