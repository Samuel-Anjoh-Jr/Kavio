import type { MessageKind } from '@trustpro/database';

/**
 * Messaging domain events (MSG-01, SRS §13). The messaging service emits these;
 * the realtime gateway fans them out over WebSocket, and the notification adapter
 * turns a delivered-but-unseen message into a push/email (MSG received, NOT-01).
 *
 * The event carries only ids and a short preview — never the full message row —
 * so a listener re-reads exactly the fields it needs and nothing user-facing sits
 * on the bus longer than the tick that carries it.
 */

export const MESSAGE_SENT = 'message.sent';

export class MessageSentEvent {
  readonly messageId: string;
  readonly conversationId: string;
  readonly senderId: string;
  /** The other member(s) who should receive it — resolved once at emit time. */
  readonly recipientIds: string[];
  readonly kind: MessageKind;
  /** A short, safe preview for the notification body and the inbox list. */
  readonly preview: string;
  readonly jobId: string | null;
  readonly requestId?: string;

  constructor(init: {
    messageId: string;
    conversationId: string;
    senderId: string;
    recipientIds: string[];
    kind: MessageKind;
    preview: string;
    jobId: string | null;
    requestId?: string;
  }) {
    this.messageId = init.messageId;
    this.conversationId = init.conversationId;
    this.senderId = init.senderId;
    this.recipientIds = init.recipientIds;
    this.kind = init.kind;
    this.preview = init.preview;
    this.jobId = init.jobId;
    this.requestId = init.requestId;
  }
}
