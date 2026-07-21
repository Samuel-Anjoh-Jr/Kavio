import { Inject, Injectable, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationChannel, NotificationStatus } from '@trustpro/database';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { NOTIFICATION_REQUESTED, NotificationRequestedEvent } from './events/notification.events';
import { NOTIFICATION_CHANNEL_PRIORITY, getChannelPriority } from './notification.config';
import { NotificationPreferenceService } from './notification-preference.service';
import {
  NOTIFICATION_DELIVERY_JOB,
  resolveLocale,
  type NotificationDeliveryJob,
  type RecipientContext,
} from './notification.types';
import { NotificationProviderRegistry } from './providers/provider.registry';
import { getTemplate, getSupportedChannels } from './templates/template.registry';

const logger = createLogger('notifications:dispatcher');

/**
 * The NotificationDispatcher (SRS §17).
 *
 * Business modules emit typed domain events; this is the ONLY component that
 * knows about preferences, channels, providers and the queue. For each request it:
 *   1. resolves the recipient (email/phone/locale/push endpoints),
 *   2. picks channels in configurable priority order, intersected with the
 *      template's supported channels, enabled providers and the user's
 *      preferences — unless the template is security-critical, which bypasses
 *      preferences and forces email,
 *   3. writes a PENDING NotificationLog row per channel, and
 *   4. enqueues delivery on the BullMQ "notifications" queue (retry/backoff).
 *
 * Rendering happens in the processor, not here, so nothing user-facing is stored
 * in Redis and a retry always re-renders with the current template.
 */
@Injectable()
export class NotificationDispatcher {
  private readonly channelPriority: NotificationChannel[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly preferences: NotificationPreferenceService,
    private readonly providers: NotificationProviderRegistry,
    private readonly queue: QueueService,
    // Injected (not read from process.env here) so priority is real configuration
    // an instance owns, and tests can drive it without touching globals.
    @Optional()
    @Inject(NOTIFICATION_CHANNEL_PRIORITY)
    channelPriority?: NotificationChannel[],
  ) {
    this.channelPriority = channelPriority ?? getChannelPriority();
  }

  @OnEvent(NOTIFICATION_REQUESTED, { async: true })
  async handleNotificationRequested(event: NotificationRequestedEvent): Promise<void> {
    try {
      await this.dispatch(event);
    } catch (error) {
      // An event listener must never bubble into the emitting request. The
      // failure is logged with its templateKey so it is traceable and alertable.
      logger.error('Dispatch failed', {
        payload: { templateKey: event.templateKey, userId: event.userId },
        error,
      });
    }
  }

  /**
   * Dispatches one notification. Returns the NotificationLog ids created, so
   * callers and tests can assert on the delivery trail.
   */
  async dispatch(event: NotificationRequestedEvent): Promise<string[]> {
    const start = Date.now();
    const template = getTemplate(event.templateKey);
    const requestId = event.requestId ?? getRequestId();

    const recipient = await this.resolveRecipientContext(event);
    if (!recipient) {
      logger.warn('Notification skipped: recipient could not be resolved', {
        payload: { templateKey: event.templateKey, userId: event.userId },
      });
      return [];
    }

    const channels = await this.selectChannels(event, recipient);
    if (channels.length === 0) {
      // Not an error: the user may simply have opted out of every channel.
      logger.info('Notification produced no deliverable channels', {
        payload: {
          templateKey: event.templateKey,
          userId: event.userId,
          securityCritical: Boolean(template.securityCritical),
        },
      });
      return [];
    }

    const logIds: string[] = [];

    for (const { channel, providerName, address } of channels) {
      // The log row is written BEFORE the provider is called, so an attempt that
      // dies mid-flight still leaves a PENDING trace rather than vanishing.
      const log = await this.prisma.client.notificationLog.create({
        data: {
          userId: event.userId,
          channel,
          provider: providerName,
          recipient: address,
          templateKey: event.templateKey,
          status: NotificationStatus.PENDING,
          metadata: {
            ...(event.metadata ?? {}),
            category: template.category,
            locale: recipient.locale,
            securityCritical: Boolean(template.securityCritical),
            ...(requestId ? { requestId } : {}),
          },
        },
        select: { id: true },
      });

      const job: NotificationDeliveryJob = {
        logId: log.id,
        channel,
        providerName,
        address,
        templateKey: event.templateKey,
        category: template.category,
        locale: recipient.locale,
        variables: event.variables,
        userId: event.userId,
        ...(requestId ? { requestId } : {}),
      };

      await this.queue.enqueue(QUEUE_NAMES.notifications, NOTIFICATION_DELIVERY_JOB, job);
      logIds.push(log.id);
    }

    // templateKey only — never the rendered content or the recipient address.
    logger.info('Notification dispatched', {
      durationMs: Date.now() - start,
      result: {
        templateKey: event.templateKey,
        userId: event.userId,
        channels: channels.map((c) => c.channel),
      },
    });

    return logIds;
  }

  /**
   * Builds the delivery address book for this notification. An explicit `to`
   * override wins (pre-account flows); otherwise the user record supplies it.
   */
  private async resolveRecipientContext(
    event: NotificationRequestedEvent,
  ): Promise<RecipientContext | null> {
    if (!event.userId) {
      if (!event.to?.email && !event.to?.phone) {
        return null;
      }
      return {
        userId: null,
        email: event.to.email ?? null,
        phone: event.to.phone ?? null,
        locale: resolveLocale(event.locale),
        pushEndpoints: [],
      };
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: event.userId },
      select: { id: true, email: true, phone: true, locale: true },
    });

    if (!user) {
      return null;
    }

    // The endpoints only decide whether push is REACHABLE (WebPushProvider fans
    // the payload out to every active device itself); a user with no live
    // subscription resolves to an empty list, so push is skipped and email wins.
    const devices = await this.prisma.client.deviceRegistration.findMany({
      where: { userId: user.id, isActive: true },
      select: { endpoint: true },
    });

    return {
      userId: user.id,
      email: event.to?.email ?? user.email,
      phone: event.to?.phone ?? user.phone,
      // An explicit locale (e.g. the current request's) overrides the stored one.
      locale: resolveLocale(event.locale ?? user.locale),
      pushEndpoints: devices.map((d) => d.endpoint),
    };
  }

  /**
   * Channel selection: priority order ∩ template support ∩ enabled providers ∩
   * preferences ∩ reachable address. Security-critical templates skip the
   * preference check and deliver by email only.
   */
  private async selectChannels(
    event: NotificationRequestedEvent,
    recipient: RecipientContext,
  ): Promise<Array<{ channel: NotificationChannel; providerName: string; address: string }>> {
    const template = getTemplate(event.templateKey);
    const supported = new Set(getSupportedChannels(event.templateKey));

    const candidates = template.securityCritical
      ? [NotificationChannel.EMAIL]
      : this.channelPriority;

    const allowed = template.securityCritical
      ? null // preferences bypassed entirely
      : recipient.userId
        ? await this.preferences.getEnabledChannels(recipient.userId, template.category)
        : null; // no account yet ⇒ nothing to opt out of

    const selected: Array<{
      channel: NotificationChannel;
      providerName: string;
      address: string;
    }> = [];

    for (const channel of candidates) {
      if (!supported.has(channel)) continue;
      if (allowed && !allowed.has(channel)) continue;

      const provider = this.providers.get(channel);
      // A disabled provider (SMS at launch) is skipped, not failed.
      if (!provider?.isEnabled()) continue;

      const address = provider.resolveRecipient(recipient);
      if (!address) continue;

      selected.push({ channel, providerName: provider.providerName, address });
    }

    return selected;
  }
}
