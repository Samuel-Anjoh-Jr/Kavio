import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@trustpro/database';
import { createLogger } from '../../lib/logger';
import type {
  NotificationChannelProvider,
  RecipientContext,
  RenderedMessage,
} from '../notification.types';

const logger = createLogger('notifications:web-push');

/**
 * The WEB_PUSH channel (VAPID). Registered and dispatchable now; the actual
 * transport is completed in P76/P77, which add the multi-device DeviceRegistration
 * registry, expired-subscription cleanup and the service-worker click handling.
 *
 * Until then this provider is enabled only when VAPID keys exist, and
 * `resolveRecipient` returns null because no device registry exists yet — so the
 * dispatcher cleanly skips push and falls through to email in priority order,
 * rather than failing the notification. When P76 lands, only this file and the
 * recipient lookup change; no dispatch site moves.
 */
@Injectable()
export class WebPushProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.WEB_PUSH;
  readonly providerName = 'web-push';

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  isEnabled(): boolean {
    return Boolean(this.env.VAPID_PUBLIC_KEY && this.env.VAPID_PRIVATE_KEY);
  }

  resolveRecipient(recipient: RecipientContext): string | null {
    // The device registry lands in P76; until it does there is never an endpoint.
    return recipient.pushEndpoints[0] ?? null;
  }

  send(address: string, message: RenderedMessage): Promise<void> {
    if (message.channel !== 'WEB_PUSH') {
      throw new Error(`WebPushProvider received a ${message.channel} message`);
    }

    // Reaching here means a device registry exists but the transport is not wired.
    // Throw so the attempt is recorded FAILED and retried, never silently dropped.
    logger.warn('Web push transport not wired yet (lands in P76/P77)', {
      payload: { endpointHost: safeHost(address) },
    });

    return Promise.reject(new Error('WebPush transport is not wired yet — implemented in P76/P77'));
  }
}

/** Logs only the endpoint host, never the full subscription URL (it is a secret). */
function safeHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'invalid-endpoint';
  }
}
