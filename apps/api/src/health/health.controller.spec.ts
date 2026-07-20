import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { HealthController } from './health.controller';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

function makeRes(): { res: Response; status: jest.Mock } {
  const status = jest.fn().mockReturnThis();
  return { res: { status } as unknown as Response, status };
}

describe('HealthController', () => {
  it('reports ok (200) when Redis and DB are up', async () => {
    const redis = { ping: jest.fn().mockResolvedValue(true) } as unknown as RedisService;
    const prisma = {
      client: { $queryRaw: jest.fn().mockResolvedValue([{ x: 1 }]) },
    } as unknown as PrismaService;
    const controller = new HealthController(redis, prisma);
    const { res, status } = makeRes();

    const body = await controller.check(res);

    expect(body.status).toBe('ok');
    expect(body.components).toEqual({ database: 'up', redis: 'up' });
    expect(status).not.toHaveBeenCalled();
  });

  it('reports degraded (503) when Redis is down', async () => {
    const redis = { ping: jest.fn().mockResolvedValue(false) } as unknown as RedisService;
    const prisma = {
      client: { $queryRaw: jest.fn().mockResolvedValue([{ x: 1 }]) },
    } as unknown as PrismaService;
    const controller = new HealthController(redis, prisma);
    const { res, status } = makeRes();

    const body = await controller.check(res);

    expect(body.status).toBe('degraded');
    expect(body.components.redis).toBe('down');
    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
