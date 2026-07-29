import { Injectable } from '@nestjs/common';
import { NotificationChannel, Prisma } from '@kavio/database';
import { createLogger } from '../../lib/logger';
import { PrismaService } from '../../prisma/prisma.service';
import { getAppBaseUrl, isImportantCategory } from '../notification.config';
import { extractRelevantRole, resolveDeepLink } from '../notification-links';
import { NotificationSoundPreferenceService } from '../notification-sound-preference.service';
import type {
  DeliveryContext,
  NotificationChannelProvider,
  RenderedMessage,
} from '../notification.types';

const logger = createLogger('notifications:in-app');

/**
 * The IN_APP channel — the Notification Center's inbox (NOT-02).
 *
 * A provider like any other: it satisfies the same NotificationChannelProvider
 * contract, so the dispatcher fans out to it through exactly the same preference
 * and priority logic as email and push. That is the whole point of modelling the
 * inbox as a channel instead of a side-effect somewhere in the dispatcher — a
 * user who switches "in-app" off for MARKETING stops getting marketing rows, and
 * nobody had to write a second opt-out mechanism.
 *
 * "Delivery" here is a database write rather than a network call. It cannot fail
 * for want of a subscription or a mailbox, which is why IN_APP leads the channel
 * priority: whatever else happens, the notice is waiting when the user next looks.
 */
@Injectable()
export class InAppProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.IN_APP;
  readonly providerName = 'in-app';

  constructor(
    private readonly prisma: PrismaService,
    private readonly sounds: NotificationSoundPreferenceService,
  ) {}

  /** Always available — the inbox has no external dependency to be down. */
  isEnabled(): boolean {
    return true;
  }

  /**
   * The inbox belongs to an ACCOUNT. A pre-account delivery (an OTP to an email
   * that has no user row yet) has nowhere to land, so the channel is skipped and
   * email carries it — exactly the fallback the dispatcher is built to make.
   */
  resolveRecipient(recipient: { userId: string | null }): string | null {
    return recipient.userId;
  }

  async send(userId: string, message: RenderedMessage, context: DeliveryContext): Promise<void> {
    if (message.channel !== 'IN_APP') {
      // The processor renders per channel, so this cannot happen through the
      // normal path; failing loudly beats silently writing an empty row.
      throw new Error(`InAppProvider received ${message.channel} content`);
    }

    const url = resolveDeepLink(context.templateKey, context.metadata, getAppBaseUrl());
    const relevantRole = extractRelevantRole(context.metadata);
    const soundKey = await this.sounds.resolve(userId, context.category);

    await this.prisma.client.notification.create({
      data: {
        userId,
        category: context.category,
        templateKey: context.templateKey,
        title: message.content.title,
        body: message.content.body,
        // The template's own url wins when it set one (the SOS map link); the
        // resolver's answer otherwise. Both are normalised to an app path.
        url: message.content.url ?? url,
        important: isImportantCategory(context.category),
        // The role this notice is ABOUT, when its emitter knows — lets the
        // client auto-switch active role before navigating (see
        // apps/web/lib/notification-navigation.ts). Null for identity-level
        // notices where no role is more "correct" than another.
        relevantRole,
        // Resolved once at write time so the inbox row and the push payload
        // that (may have) accompanied it agree on the same sound.
        soundKey,
        metadata: (context.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: { id: true },
    });

    // templateKey only, never the rendered title/body — same discipline as the
    // delivery log, which deliberately stores no user-facing content.
    logger.info('In-app notification stored', {
      result: { userId, templateKey: context.templateKey, category: context.category },
    });
  }
}
