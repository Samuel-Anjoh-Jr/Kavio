import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@kavio/database';
import { createLogger } from '../../lib/logger';
import { isSmsEnabled } from '../notification.config';
import type {
  NotificationChannelProvider,
  RecipientContext,
  RenderedMessage,
} from '../notification.types';

const logger = createLogger('notifications:sms');

/**
 * The SMS channel — REGISTERED but feature-flagged OFF (SRS §17, launch
 * constraint). SMS needs a paid Cameroonian aggregator, so it is deferred.
 *
 * This stub exists so the seam is real rather than hypothetical: it is a fully
 * registered provider that the dispatcher already considers on every dispatch and
 * skips only because `isEnabled()` is false. Setting NOTIFICATIONS_SMS_ENABLED=true
 * routes SMS-capable templates here immediately, with zero call-site changes —
 * that flip is exercised by the dispatcher tests.
 *
 * When the real aggregator is bought, only `send()` below changes: recipients are
 * already stored in E.164 and every SMS-capable template already has EN/FR copy.
 */
@Injectable()
export class SmsProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.SMS;
  readonly providerName = 'sms-stub';

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  isEnabled(): boolean {
    return isSmsEnabled(this.env);
  }

  resolveRecipient(recipient: RecipientContext): string | null {
    // Already E.164-normalised at capture (ACC-04), so this is send-ready.
    return recipient.phone;
  }

  send(address: string, message: RenderedMessage): Promise<void> {
    if (message.channel !== 'SMS') {
      throw new Error(`SmsProvider received a ${message.channel} message`);
    }

    // The stub "delivers" by recording the attempt. The NotificationLog row is
    // still written by the processor, so enabling the flag produces a complete,
    // inspectable delivery trail before a real provider is ever connected.
    logger.info('SMS stub invoked (no real delivery — provider deferred)', {
      payload: { recipientSuffix: address.slice(-4), length: message.content.text.length },
    });

    return Promise.resolve();
  }
}
