import { Injectable } from '@nestjs/common';
import { NotificationCategory, NotificationChannel, Prisma } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationSoundPreferenceService } from './notification-sound-preference.service';
import { NotificationProviderRegistry } from './providers/provider.registry';
import type { NotificationFeedView, NotificationSettingsView } from './models/notification.model';

const logger = createLogger('notifications:center');

/** Which slice of the inbox a request wants (NOT-02). */
export type NotificationFilter = 'ALL' | 'UNREAD' | 'IMPORTANT';

/**
 * The Notification Center (NOT-02): the user's own inbox and their per-channel
 * preferences.
 *
 * Reads and writes both live here because they are the same small surface, but
 * they are exposed separately — reads through NotificationCenterResolver
 * (GraphQL), writes through NotificationsController (REST) — per the DUAL API
 * RULE. Every query is scoped by `userId` in the WHERE: a notification is
 * private, and there is no admin path into someone's inbox from here.
 */
@Injectable()
export class NotificationCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preferences: NotificationPreferenceService,
    private readonly sounds: NotificationSoundPreferenceService,
    private readonly providers: NotificationProviderRegistry,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Reads
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * One page of the inbox plus the unread total.
   *
   * Paginated by `before` (a createdAt cursor) rather than an offset: rows arrive
   * continuously at the head of this list, and an offset page 2 would skip or
   * repeat items every time one lands mid-scroll.
   */
  async feed(
    user: AuthenticatedUser,
    filter: NotificationFilter,
    limit: number,
    before?: Date,
  ): Promise<NotificationFeedView> {
    const take = Math.min(Math.max(limit, 1), 50);

    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
      ...(filter === 'UNREAD' ? { readAt: null } : {}),
      ...(filter === 'IMPORTANT' ? { important: true } : {}),
      ...(before ? { createdAt: { lt: before } } : {}),
    };

    // take + 1 to learn whether another page exists without a second count query.
    const [rows, unreadCount] = await Promise.all([
      this.prisma.client.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: take + 1,
        select: {
          id: true,
          category: true,
          templateKey: true,
          title: true,
          body: true,
          url: true,
          important: true,
          relevantRole: true,
          soundKey: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.unreadCount(user),
    ]);

    const hasMore = rows.length > take;

    return {
      items: rows.slice(0, take),
      unreadCount,
      hasMore,
    };
  }

  /** The header badge (NOT-02). */
  async unreadCount(user: AuthenticatedUser): Promise<number> {
    return this.prisma.client.notification.count({
      where: { userId: user.id, readAt: null },
    });
  }

  /** The preferences screen's full state: the grid, channel availability, push status, sounds. */
  async settings(user: AuthenticatedUser): Promise<NotificationSettingsView> {
    const [rows, pushDevices, soundPreferences] = await Promise.all([
      this.prisma.client.notificationPreference.findMany({
        where: { userId: user.id },
        select: { channel: true, category: true, enabled: true },
        orderBy: [{ channel: 'asc' }, { category: 'asc' }],
      }),
      this.prisma.client.deviceRegistration.count({
        where: { userId: user.id, isActive: true },
      }),
      this.sounds.list(user.id),
    ]);

    return {
      preferences: rows,
      // Availability is the PROVIDER's answer, not a hardcoded list — that is what
      // makes SMS "coming soon" flip to usable with a feature-flag change and no
      // frontend edit (SRS §17 launch constraint).
      channels: Object.values(NotificationChannel).map((channel) => ({
        channel,
        available: this.providers.isChannelEnabled(channel),
      })),
      pushSubscribed: pushDevices > 0,
      soundPreferences,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Writes
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Marks one notification read. Scoped by userId in the WHERE, so a guessed id
   * belonging to someone else updates nothing rather than leaking its existence.
   */
  async markRead(user: AuthenticatedUser, id: string): Promise<{ updated: number }> {
    const result = await this.prisma.client.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    return { updated: result.count };
  }

  async markAllRead(user: AuthenticatedUser): Promise<{ updated: number }> {
    const result = await this.prisma.client.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    logger.info('Marked notifications read', {
      result: { userId: user.id, updated: result.count },
    });

    return { updated: result.count };
  }

  /**
   * Updates one channel × category preference cell (NOT-02, SET-02).
   *
   * SECURITY is refused rather than silently ignored: security notices bypass
   * preferences by design (SRS §17), and a toggle that appears to work but does
   * nothing is worse than one that explains itself.
   */
  async setPreference(
    user: AuthenticatedUser,
    channel: NotificationChannel,
    category: Parameters<NotificationPreferenceService['setPreference']>[2],
    enabled: boolean,
  ): Promise<{ channel: NotificationChannel; category: string; enabled: boolean }> {
    await this.preferences.setPreference(user.id, channel, category, enabled);

    logger.info('Notification preference updated', {
      result: { userId: user.id, channel, category, enabled },
    });

    return { channel, category, enabled };
  }

  /** Sets one category's custom sound override (NOT-02). */
  async setSoundPreference(
    user: AuthenticatedUser,
    category: NotificationCategory,
    soundKey: string,
  ): Promise<{ category: NotificationCategory; soundKey: string }> {
    return this.sounds.setPreference(user.id, category, soundKey);
  }
}
