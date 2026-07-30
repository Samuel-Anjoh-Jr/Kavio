import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@kavio/database';
import { createLogger } from '../../lib/logger';
import {
  getWhatsappProviderName,
  isWhatsappEnabled,
  type WhatsappProviderName,
} from '../notification.config';
import type {
  NotificationChannelProvider,
  RecipientContext,
  RenderedMessage,
} from '../notification.types';
import { sendTwilioMessage, toWhatsappAddress } from './twilio.util';

const logger = createLogger('notifications:whatsapp');

/**
 * The WhatsApp channel. Same two-backend shape as SmsProvider (and
 * EmailProvider's console/resend split):
 *  - "stub": logs the attempt and delivers nothing. Runs until Twilio is
 *    configured for WhatsApp, and still runs if NOTIFICATIONS_WHATSAPP_ENABLED
 *    is forced "true" without credentials (kept for local dispatch testing).
 *  - "twilio": real delivery over Twilio's WhatsApp API (same Messages
 *    endpoint as SMS, addressed with a `whatsapp:` prefix).
 *
 * Filling in TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
 * TWILIO_WHATSAPP_FROM_NUMBER switches this to "twilio" and flips
 * `isEnabled()` on with no call-site change — recipients are already stored
 * in E.164, so the number Twilio needs is already send-ready.
 */
@Injectable()
export class WhatsappProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.WHATSAPP;

  private readonly backend: WhatsappProviderName;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    this.backend = getWhatsappProviderName(env);
  }

  get providerName(): string {
    return this.backend === 'twilio' ? 'twilio' : 'whatsapp-stub';
  }

  isEnabled(): boolean {
    return isWhatsappEnabled(this.env);
  }

  resolveRecipient(recipient: RecipientContext): string | null {
    // Already E.164-normalised at capture (ACC-04), so this is send-ready.
    return recipient.phone;
  }

  async send(address: string, message: RenderedMessage): Promise<void> {
    if (message.channel !== 'WHATSAPP') {
      throw new Error(`WhatsappProvider received a ${message.channel} message`);
    }

    if (this.backend === 'stub') {
      // The stub "delivers" by recording the attempt. The NotificationLog row
      // is still written by the processor, so enabling the flag without
      // credentials still produces a complete, inspectable delivery trail.
      logger.info('WhatsApp stub invoked (no real delivery — Twilio not configured)', {
        payload: { recipientSuffix: address.slice(-4), length: message.content.text.length },
      });
      return;
    }

    const accountSid = this.env.TWILIO_ACCOUNT_SID;
    const authToken = this.env.TWILIO_AUTH_TOKEN;
    const from = this.env.TWILIO_WHATSAPP_FROM_NUMBER;
    if (!accountSid || !authToken || !from) {
      // Guarded by getWhatsappProviderName() at construction time, so this
      // only fires if env changed after the provider was built.
      throw new Error('Twilio WhatsApp credentials are not fully configured');
    }

    await sendTwilioMessage(
      { accountSid, authToken },
      { to: toWhatsappAddress(address), from: toWhatsappAddress(from), body: message.content.text },
    );
  }
}
