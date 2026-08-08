import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Role, UserStatus } from '@kavio/database';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../notifications/events/notification.events';
import { ANNOUNCEMENT_PUBLISHED, AnnouncementPublishedEvent } from './admin.events';

const logger = createLogger('admin:announcements');

/** Maps an announcement's audience to the role that gates it. `ALL` has none — everyone active qualifies. */
const AUDIENCE_ROLE: Partial<Record<string, Role>> = {
  WORKERS: Role.WORKER,
  CLIENTS: Role.CLIENT,
  BUSINESSES: Role.BUSINESS,
  AGENTS: Role.AGENT,
};

/**
 * Fans a published announcement out as a push notification (ADM-07).
 *
 * `liveAnnouncements` already lets a signed-in user pull the in-app banner on
 * demand; this is the push half — the reason a worker who isn't in the app
 * right now still hears about it. One NOTIFICATION_REQUESTED per recipient
 * keeps this on the same per-user dispatcher as everything else, so
 * preferences, EN/FR rendering and the delivery log apply exactly as they do
 * to any other notification — an announcement is not a special case.
 */
@Injectable()
export class AnnouncementNotificationListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(ANNOUNCEMENT_PUBLISHED)
  async onAnnouncementPublished(event: AnnouncementPublishedEvent): Promise<void> {
    const role = AUDIENCE_ROLE[event.audience];

    const recipients = await this.prisma.client.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        ...(role ? { roles: { some: { role, isActive: true } } } : {}),
      },
      select: { id: true },
    });

    for (const recipient of recipients) {
      this.events.emit(
        NOTIFICATION_REQUESTED,
        new NotificationRequestedEvent({
          userId: recipient.id,
          templateKey: 'admin.announcement_published',
          variables: {
            titleEn: event.titleEn,
            titleFr: event.titleFr,
            bodyEn: event.bodyEn,
            bodyFr: event.bodyFr,
          },
          requestId: event.requestId,
          metadata: { announcementId: event.announcementId },
        }),
      );
    }

    logger.info('Announcement fanned out to recipients', {
      payload: { announcementId: event.announcementId, audience: event.audience },
      result: { recipients: recipients.length },
    });
  }
}
