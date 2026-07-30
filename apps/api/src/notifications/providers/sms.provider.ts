import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@kavio/database';
import { createLogger } from '../../lib/logger';
import { getSmsProviderName, isSmsEnabled, type SmsProviderName } from '../notification.config';
import type {
  NotificationChannelProvider,
  RecipientContext,
  RenderedMessage,
} from '../notification.types';
import { sendTwilioMessage } from './twilio.util';

const logger = createLogger('notifications:sms');

/**
 * The SMS channel. Two backends behind one channel, same shape as
 * EmailProvider's console/resend split:
 *  - "stub": logs the attempt and delivers nothing. This is what runs until
 *    Twilio is configured, and what still runs if NOTIFICATIONS_SMS_ENABLED is
 *    forced "true" without credentials (kept for local dispatch testing).
 *  - "twilio": real delivery over Twilio's Messages REST API.
 *
 * Which backend is active is config, not code — filling in TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN and TWILIO_SMS_FROM_NUMBER switches this to "twilio" and
 * flips `isEnabled()` on with no call-site change (SRS §17, launch constraint).
 */
@Injectable()
export class SmsProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.SMS;

  private readonly backend: SmsProviderName;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    this.backend = getSmsProviderName(env);
  }

  get providerName(): string {
    return this.backend === 'twilio' ? 'twilio' : 'sms-stub';
  }

  isEnabled(): boolean {
    return isSmsEnabled(this.env);
  }

  resolveRecipient(recipient: RecipientContext): string | null {
    // Already E.164-normalised at capture (ACC-04), so this is send-ready.
    return recipient.phone;
  }

  async send(address: string, message: RenderedMessage): Promise<void> {
    if (message.channel !== 'SMS') {
      throw new Error(`SmsProvider received a ${message.channel} message`);
    }

    if (this.backend === 'stub') {
      // The stub "delivers" by recording the attempt. The NotificationLog row
      // is still written by the processor, so enabling the flag without
      // credentials still produces a complete, inspectable delivery trail.
      logger.info('SMS stub invoked (no real delivery — Twilio not configured)', {
        payload: { recipientSuffix: address.slice(-4), length: message.content.text.length },
      });
      return;
    }

    const accountSid = this.env.TWILIO_ACCOUNT_SID;
    const authToken = this.env.TWILIO_AUTH_TOKEN;
    const from = this.env.TWILIO_SMS_FROM_NUMBER;
    if (!accountSid || !authToken || !from) {
      // Guarded by getSmsProviderName() at construction time, so this only
      // fires if env changed after the provider was built.
      throw new Error('Twilio SMS credentials are not fully configured');
    }

    await sendTwilioMessage(
      { accountSid, authToken },
      { to: address, from, body: message.content.text },
    );
  }
}
