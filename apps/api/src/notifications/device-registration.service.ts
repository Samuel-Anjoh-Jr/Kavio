import { Injectable } from '@nestjs/common';
import { DevicePlatform } from '@trustpro/database';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterDeviceDto } from './dto/device-registration.dto';

const logger = createLogger('notifications:devices');

/**
 * The web-push device registry (NOT-01, P76). A user reads TrustPro on several
 * devices, so one identity has many subscriptions keyed by their globally-unique
 * endpoint. Registering is an UPSERT on the endpoint: a browser that re-subscribes
 * (keys rotated, permission re-granted) updates the one row rather than piling up
 * duplicates, and it re-activates a row a previous push failure had deactivated.
 */
@Injectable()
export class DeviceRegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, dto: RegisterDeviceDto): Promise<{ id: string }> {
    const device = await this.prisma.client.deviceRegistration.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        platform: DevicePlatform.WEB,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        deviceName: dto.deviceName ?? null,
      },
      update: {
        // Re-bind the endpoint to whoever holds it now (a shared browser) and
        // re-activate it — a fresh subscribe means the endpoint is live again.
        userId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        deviceName: dto.deviceName ?? null,
        isActive: true,
        lastSeenAt: new Date(),
      },
      select: { id: true },
    });

    logger.info('Device registered for web push', { payload: { userId } });
    return device;
  }

  /** Unsubscribes one endpoint the caller owns (sign-out on a device). */
  async unregister(userId: string, endpoint: string): Promise<{ removed: boolean }> {
    const result = await this.prisma.client.deviceRegistration.deleteMany({
      where: { userId, endpoint },
    });
    return { removed: result.count > 0 };
  }
}
