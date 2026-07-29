import { Injectable } from '@nestjs/common';
import { NotificationCategory, NotificationChannel } from '@kavio/database';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { buildDefaultPreferences } from './notification.config';

const logger = createLogger('notifications:preferences');

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Seeds the default channel × category matrix for a new identity (SRS §26.1).
   * Idempotent via skipDuplicates so a retried sign-up never conflicts.
   *
   * Prefer seeding inside the same transaction that creates the User — see
   * `buildDefaultPreferences`, which AuthService uses directly so the identity
   * and its preferences commit atomically.
   */
  async seedDefaults(userId: string): Promise<number> {
    const result = await this.prisma.client.notificationPreference.createMany({
      data: buildDefaultPreferences(userId),
      skipDuplicates: true,
    });

    logger.info('Seeded default notification preferences', {
      result: { userId, created: result.count },
    });

    return result.count;
  }

  /**
   * Resolves which channels the user permits for a category.
   *
   * A MISSING row means enabled: preferences are an opt-out list, so a user
   * created before a channel or category existed still receives its
   * notifications instead of silently losing them.
   */
  async getEnabledChannels(
    userId: string,
    category: NotificationCategory,
  ): Promise<Set<NotificationChannel>> {
    const rows = await this.prisma.client.notificationPreference.findMany({
      where: { userId, category },
      select: { channel: true, enabled: true },
    });

    const disabled = new Set(rows.filter((row) => !row.enabled).map((row) => row.channel));

    return new Set(Object.values(NotificationChannel).filter((channel) => !disabled.has(channel)));
  }

  /** Updates one preference cell (used by the settings UI in P78). */
  async setPreference(
    userId: string,
    channel: NotificationChannel,
    category: NotificationCategory,
    enabled: boolean,
  ): Promise<void> {
    await this.prisma.client.notificationPreference.upsert({
      where: { userId_channel_category: { userId, channel, category } },
      create: { userId, channel, category, enabled },
      update: { enabled },
    });
  }
}
