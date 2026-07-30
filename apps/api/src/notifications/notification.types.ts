import type { NotificationCategory, NotificationChannel } from '@kavio/database';

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

/** Same shape as SMS — both are short plain-text channels (WhatsApp session/template copy). */
export interface WhatsappContent {
  text: string;
}

/**
 * A row in the in-app Notification Center (NOT-02). Same shape as a push notice
 * by design, not by accident: both are "one line, one deep link", so IN_APP
 * renders from the WEB_PUSH copy rather than duplicating ~30 templates × 2
 * locales that would then drift apart.
 */
export interface InAppContent {
  title: string;
  body: string;
  /** App-relative deep link into the surface this is about. */
  url?: string;
}

export type RenderedContent =
  EmailContent | WebPushContent | SmsContent | WhatsappContent | InAppContent;

/** Discriminated union so a provider can narrow to the content it understands. */
export type RenderedMessage =
  | { channel: 'EMAIL'; content: EmailContent }
  | { channel: 'WEB_PUSH'; content: WebPushContent }
  | { channel: 'SMS'; content: SmsContent }
  | { channel: 'WHATSAPP'; content: WhatsappContent }
  | { channel: 'IN_APP'; content: InAppContent };

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

  /**
   * Deliver. Throwing marks the attempt FAILED and lets BullMQ retry.
   *
   * `context` carries what the message body cannot: which template and category
   * produced it, and the ids the surface needs. Network providers ignore it;
   * IN_APP needs it to write a Notification row that can be filtered and
   * deep-linked. Providers may declare a shorter signature — TypeScript accepts a
   * function taking fewer parameters — so adding it broke nothing.
   */
  send(address: string, message: RenderedMessage, context: DeliveryContext): Promise<void>;
}

/** What produced a delivery, passed to the provider alongside the rendered copy. */
export interface DeliveryContext {
  templateKey: string;
  category: NotificationCategory;
  /** Null for pre-account deliveries (an OTP to an email with no user yet). */
  userId: string | null;
  locale: Locale;
  /** Ids the destination surface needs (jobId, disputeId…). Never secrets. */
  metadata?: Record<string, unknown>;
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
  /** Event metadata forwarded to the provider (see DeliveryContext.metadata). */
  metadata?: Record<string, unknown>;
  /** Correlates the delivery back to the request that triggered it. */
  requestId?: string;
}

export const NOTIFICATION_DELIVERY_JOB = 'notification.delivery';
