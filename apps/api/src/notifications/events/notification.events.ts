import type { TemplateKey, TemplateVariables } from '../templates/template.registry';

/**
 * Typed domain events (SRS §17). Business modules EMIT these via
 * @nestjs/event-emitter and never touch a provider, a channel, or the queue:
 *
 *   this.events.emit(
 *     NOTIFICATION_REQUESTED,
 *     new NotificationRequestedEvent({
 *       userId,
 *       templateKey: 'auth.otp_code',
 *       variables: { code, expiresInMinutes: 10 },
 *     }),
 *   );
 *
 * The dispatcher owns everything downstream: preferences, channel priority,
 * rendering, queueing and logging. Adding a channel never touches a call site.
 */
export const NOTIFICATION_REQUESTED = 'notification.requested';

export interface NotificationRequestedInit<K extends TemplateKey = TemplateKey> {
  /** The identity to notify. Null only for pre-account flows (see `to`). */
  userId: string | null;
  templateKey: K;
  variables: TemplateVariables<K>;
  /**
   * Explicit delivery address for recipients without an account row yet
   * (e.g. verifying an email during sign-up). When set, it overrides the
   * address resolved from the user record for that channel.
   */
  to?: { email?: string; phone?: string };
  /** Overrides the recipient's stored locale (e.g. the request's Accept-Language). */
  locale?: string;
  /** Correlates the notification with the originating request in the logs. */
  requestId?: string;
  /** Extra context persisted on NotificationLog.metadata (never user-facing copy). */
  metadata?: Record<string, unknown>;
}

export class NotificationRequestedEvent<K extends TemplateKey = TemplateKey> {
  readonly userId: string | null;
  readonly templateKey: K;
  readonly variables: TemplateVariables<K>;
  readonly to?: { email?: string; phone?: string };
  readonly locale?: string;
  readonly requestId?: string;
  readonly metadata?: Record<string, unknown>;

  constructor(init: NotificationRequestedInit<K>) {
    this.userId = init.userId;
    this.templateKey = init.templateKey;
    this.variables = init.variables;
    this.to = init.to;
    this.locale = init.locale;
    this.requestId = init.requestId;
    this.metadata = init.metadata;
  }
}
