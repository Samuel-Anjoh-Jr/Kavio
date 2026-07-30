import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@kavio/database';
import { createLogger } from '../../lib/logger';
import { isWhatsappEnabled } from '../notification.config';
import type {
  NotificationChannelProvider,
  RecipientContext,
  RenderedMessage,
} from '../notification.types';

const logger = createLogger('notifications:whatsapp');

/**
 * The WhatsApp channel — REGISTERED but feature-flagged OFF (same launch
 * posture as SMS). WhatsApp needs a Business API vendor (a Meta BSP such as
 * 360dialog or Twilio) with real credentials, so it is deferred.
 *
 * This stub exists so the seam is real rather than hypothetical: it is a fully
 * registered provider the dispatcher already considers on every dispatch and
 * skips only because `isEnabled()` is false. Setting NOTIFICATIONS_WHATSAPP_ENABLED=true
 * routes WhatsApp-capable templates here immediately, with zero call-site
 * changes — recipients are already stored in E.164, so the number a BSP needs
 * is already send-ready.
 *
 * When a vendor is connected, only `send()` below changes: it makes the real
 * HTTP call to that vendor's API using the WHATSAPP_API_* env vars.
 */
@Injectable()
export class WhatsappProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.WHATSAPP;
  readonly providerName = 'whatsapp-stub';

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  isEnabled(): boolean {
    return isWhatsappEnabled(this.env);
  }

  resolveRecipient(recipient: RecipientContext): string | null {
    // Already E.164-normalised at capture (ACC-04), so this is send-ready.
    return recipient.phone;
  }

  send(address: string, message: RenderedMessage): Promise<void> {
    if (message.channel !== 'WHATSAPP') {
      throw new Error(`WhatsappProvider received a ${message.channel} message`);
    }

    // The stub "delivers" by recording the attempt. The NotificationLog row is
    // still written by the processor, so enabling the flag produces a complete,
    // inspectable delivery trail before a real vendor is ever connected.
    logger.info('WhatsApp stub invoked (no real delivery — provider deferred)', {
      payload: { recipientSuffix: address.slice(-4), length: message.content.text.length },
    });

    return Promise.resolve();
  }
}
