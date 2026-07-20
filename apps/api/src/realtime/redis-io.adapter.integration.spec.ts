import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import IORedis from 'ioredis';
import { io, Socket } from 'socket.io-client';
import { RedisIoAdapter } from './redis-io.adapter';
import { SystemGateway } from './system.gateway';
import { RedisModule } from '../redis/redis.module';
import { RedisService } from '../redis/redis.service';
import { parseRedisUrl } from '../redis/redis.util';

/**
 * Proves horizontal scaling: two independent Nest apps, each with its own
 * Socket.IO server backed by the Redis pub/sub adapter. A client connected to
 * instance B receives an event that instance A broadcasts — the message crosses
 * process boundaries only because the adapter relays it through Redis.
 *
 * Self-skips (stays green) when Redis is unreachable, like the queue integration
 * test; run locally after `pnpm docker:up`.
 */
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

@Module({ imports: [RedisModule], providers: [SystemGateway] })
class WsTestModule {}

async function redisReachable(): Promise<boolean> {
  const probe = new IORedis({
    ...parseRedisUrl(REDIS_URL),
    maxRetriesPerRequest: null,
    retryStrategy: () => null,
    lazyConnect: true,
  });
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

async function bootstrapInstance(port: number): Promise<INestApplication> {
  const app = await NestFactory.create(WsTestModule, { logger: false });
  app.useWebSocketAdapter(new RedisIoAdapter(app, app.get(RedisService)));
  await app.listen(port);
  return app;
}

describe('RedisIoAdapter (integration)', () => {
  let available = false;
  let appA: INestApplication;
  let appB: INestApplication;
  const portA = 4311;
  const portB = 4312;

  beforeAll(async () => {
    available = await redisReachable();
    if (available) {
      // RedisModule reads REDIS_URL from the environment; ensure it's set for
      // the module factory (jest doesn't load the app .env).
      process.env.REDIS_URL = REDIS_URL;
      appA = await bootstrapInstance(portA);
      appB = await bootstrapInstance(portB);
    }
  });

  afterAll(async () => {
    if (appA) await appA.close();
    if (appB) await appB.close();
  });

  it('fans out a broadcast from instance A to a client on instance B', async () => {
    if (!available) {
      console.warn('Skipping: Redis not reachable at ' + REDIS_URL);
      return;
    }

    const room = 'trust-room';
    const client: Socket = io(`http://localhost:${portB}/system`, {
      transports: ['websocket'],
      forceNew: true,
    });

    try {
      // Connect to B and join the room (adapter registers the room in Redis).
      await new Promise<void>((resolve, reject) => {
        client.on('connect_error', reject);
        client.emit('subscribe', room, () => resolve());
      });

      const received = new Promise<{ hello: string }>((resolve) => {
        client.on('trust:event', (payload: { hello: string }) => resolve(payload));
      });

      // Give the room membership a moment to propagate through Redis.
      await new Promise((r) => setTimeout(r, 250));

      // Broadcast from instance A — the client is on instance B.
      const gatewayA = appA.get(SystemGateway);
      gatewayA.broadcast(room, 'trust:event', { hello: 'from-A' });

      await expect(received).resolves.toEqual({ hello: 'from-A' });
    } finally {
      client.disconnect();
    }
  }, 20_000);
});
