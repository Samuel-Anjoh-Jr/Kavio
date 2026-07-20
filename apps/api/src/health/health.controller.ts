import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

type ComponentStatus = 'up' | 'down';

interface HealthBody {
  status: 'ok' | 'degraded';
  requestId: string;
  components: {
    database: ComponentStatus;
    redis: ComponentStatus;
  };
}

/**
 * Liveness/readiness probe. Pings Redis and the database in parallel and
 * reports each component; overall status is `degraded` (503) if any dependency
 * is down so orchestrators and uptime checks react correctly (SRS §18, §24.1).
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthBody> {
    const [redisUp, dbUp] = await Promise.all([this.redis.ping(), this.pingDatabase()]);

    const healthy = redisUp && dbUp;
    if (!healthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: healthy ? 'ok' : 'degraded',
      requestId: getRequestId() ?? 'unknown',
      components: {
        database: dbUp ? 'up' : 'down',
        redis: redisUp ? 'up' : 'down',
      },
    };
  }

  private async pingDatabase(): Promise<boolean> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
