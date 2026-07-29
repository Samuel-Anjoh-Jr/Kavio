import { HttpStatus, Injectable } from '@nestjs/common';
import { NotificationCategory } from '@kavio/database';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import {
  isNotificationSoundKey,
  resolveSoundKey,
  type NotificationSoundKey,
} from './notification-sound';

const logger = createLogger('notifications:sound-preferences');

/**
 * Per-category custom sound preference (NOT-02). Same opt-out shape as
 * NotificationPreference: a missing row means "use the category's default",
 * so a user who never opens the sound picker still gets sensible per-category
 * sounds rather than silence.
 */
@Injectable()
export class NotificationSoundPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** The full grid, one row per category — categories never chosen fall back client-side. */
  async list(userId: string): Promise<Array<{ category: NotificationCategory; soundKey: string }>> {
    return this.prisma.client.notificationSoundPreference.findMany({
      where: { userId },
      select: { category: true, soundKey: true },
      orderBy: { category: 'asc' },
    });
  }

  /** Resolves ONE category's effective sound, override or category default. */
  async resolve(
    userId: string | null,
    category: NotificationCategory,
  ): Promise<NotificationSoundKey> {
    if (!userId) {
      return resolveSoundKey(category, null);
    }
    const row = await this.prisma.client.notificationSoundPreference.findUnique({
      where: { userId_category: { userId, category } },
      select: { soundKey: true },
    });
    return resolveSoundKey(category, row?.soundKey);
  }

  async setPreference(
    userId: string,
    category: NotificationCategory,
    soundKey: string,
  ): Promise<{ category: NotificationCategory; soundKey: string }> {
    if (!isNotificationSoundKey(soundKey)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'UNKNOWN_SOUND_KEY',
        'That is not a sound Kavio knows about.',
        { soundKey: ['Unknown sound key.'] },
      );
    }

    await this.prisma.client.notificationSoundPreference.upsert({
      where: { userId_category: { userId, category } },
      create: { userId, category, soundKey },
      update: { soundKey },
    });

    logger.info('Notification sound preference updated', {
      result: { userId, category, soundKey },
    });

    return { category, soundKey };
  }
}
