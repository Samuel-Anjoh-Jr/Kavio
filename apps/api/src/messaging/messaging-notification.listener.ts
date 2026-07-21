import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import { MESSAGE_SENT, MessageSentEvent } from './events/messaging.events';

/**
 * Turns a sent message into a "message received" notification for each recipient
 * (MSG-01, NOT-01). The dispatcher owns everything downstream — preferences (a
 * muted thread suppresses it), channel priority, EN/FR and the deep link.
 *
 * The realtime gateway already delivered the message to any open socket; this is
 * the fallback that reaches someone whose app is closed, so it deep-links
 * straight to the conversation.
 */
@Injectable()
export class MessagingNotificationListener {
  constructor(
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(MESSAGE_SENT)
  async onMessageSent(event: MessageSentEvent): Promise<void> {
    const senderName = await this.senderName(event.senderId);

    for (const recipientId of event.recipientIds) {
      // A member who muted this thread hears nothing (checked here rather than in
      // the dispatcher, which only knows category-level preferences).
      if (await this.isMuted(event.conversationId, recipientId)) {
        continue;
      }

      this.events.emit(
        NOTIFICATION_REQUESTED,
        new NotificationRequestedEvent({
          userId: recipientId,
          templateKey: 'message.received',
          variables: { senderName, preview: event.preview },
          metadata: {
            conversationId: event.conversationId,
            deepLink: `/messages/${event.conversationId}`,
          },
          requestId: event.requestId,
        }),
      );
    }
  }

  private async senderName(senderId: string): Promise<string> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: senderId },
      select: { name: true },
    });
    return user?.name?.trim() || 'Someone';
  }

  private async isMuted(conversationId: string, userId: string): Promise<boolean> {
    const participant = await this.prisma.client.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { mutedAt: true },
    });
    return Boolean(participant?.mutedAt);
  }
}
