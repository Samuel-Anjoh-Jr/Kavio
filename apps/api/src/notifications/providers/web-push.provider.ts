import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@trustpro/database';
import webpush from 'web-push';
import { createLogger } from '../../lib/logger';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  NotificationChannelProvider,
  RecipientContext,
  RenderedMessage,
} from '../notification.types';

const logger = createLogger('notifications:web-push');

/** Push endpoints that return these are permanently gone — deactivate, don't retry. */
const GONE_STATUS = new Set([404, 410]);

/**
 * The WEB_PUSH channel (VAPID), fully wired in P76.
 *
 * Web push targets a SUBSCRIPTION, not a user, and a user has many devices — so
 * the "address" the dispatcher hands us is the user id, and `send` fans the
 * payload out to EVERY active DeviceRegistration for that user. A subscription
 * the push service reports as gone (404/410) is deactivated so the dispatcher
 * stops aiming at it; a transient failure with at least one success still counts
 * as delivered, and an all-transient-failure throws so BullMQ retries.
 *
 * The full endpoint URL is a secret and is never logged — only its host.
 */
@Injectable()
export class WebPushProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.WEB_PUSH;
  readonly providerName = 'web-push';

  private readonly vapid?: { subject: string; publicKey: string; privateKey: string };

  constructor(
    private readonly prisma: PrismaService,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
      this.vapid = {
        subject: env.VAPID_SUBJECT?.trim() || 'mailto:support@trustpro.cm',
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      };
    }
  }

  isEnabled(): boolean {
    return Boolean(this.vapid);
  }

  /**
   * The delivery target for web push is the identity — `send` expands it to that
   * identity's devices. Returns null when the user has no active subscription, so
   * the dispatcher cleanly falls through to email in priority order.
   */
  resolveRecipient(recipient: RecipientContext): string | null {
    if (!recipient.userId || recipient.pushEndpoints.length === 0) {
      return null;
    }
    return recipient.userId;
  }

  async send(userId: string, message: RenderedMessage): Promise<void> {
    if (message.channel !== 'WEB_PUSH') {
      throw new Error(`WebPushProvider received a ${message.channel} message`);
    }
    if (!this.vapid) {
      throw new Error('Web push is not configured (VAPID keys missing)');
    }

    const subscriptions = await this.prisma.client.deviceRegistration.findMany({
      where: { userId, isActive: true },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (subscriptions.length === 0) {
      // resolveRecipient should have prevented this; treat as delivered-to-nobody
      // rather than a retryable failure.
      return;
    }

    const payload = JSON.stringify({
      title: message.content.title,
      body: message.content.body,
      ...(message.content.url ? { url: message.content.url } : {}),
    });

    let delivered = 0;
    let transientFailures = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { vapidDetails: this.vapid },
        );
        delivered += 1;
        await this.prisma.client.deviceRegistration.update({
          where: { id: sub.id },
          data: { lastSeenAt: new Date() },
        });
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode !== undefined && GONE_STATUS.has(statusCode)) {
          // The browser dropped the subscription — deactivate so we stop aiming at it.
          await this.prisma.client.deviceRegistration.update({
            where: { id: sub.id },
            data: { isActive: false },
          });
          logger.info('Deactivated expired push subscription', {
            payload: { endpointHost: safeHost(sub.endpoint), statusCode },
          });
        } else {
          transientFailures += 1;
          logger.warn('Web push delivery failed (will retry)', {
            payload: { endpointHost: safeHost(sub.endpoint), statusCode },
          });
        }
      }
    }

    // At least one device got it → success. No device got it but some failures
    // were transient → throw so BullMQ retries. All failures were "gone" (now
    // deactivated) → nothing left to deliver, so resolve.
    if (delivered === 0 && transientFailures > 0) {
      throw new Error(`Web push failed for all ${transientFailures} device(s)`);
    }
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
