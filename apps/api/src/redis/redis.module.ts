import { Global, Module, OnApplicationShutdown, Provider } from '@nestjs/common';
import IORedis, { Redis } from 'ioredis';
import { createLogger } from '../lib/logger';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

const logger = createLogger('redis');

function resolveRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      'REDIS_URL is not set — required for BullMQ, rate limiting and the WS adapter.',
    );
  }
  return url;
}

const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (): Redis => {
    const client = new IORedis(resolveRedisUrl(), {
      // BullMQ requires this; harmless for the shared client's other roles and
      // avoids ioredis retrying a single command forever when Redis is down.
      maxRetriesPerRequest: null,
      // Keep trying to reconnect with a capped backoff instead of giving up.
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    });

    client.on('connect', () => logger.info('Redis connected'));
    client.on('reconnecting', () => logger.warn('Redis reconnecting'));
    // Without a listener ioredis rethrows connection errors as unhandled and
    // crashes the process; log and let the retryStrategy recover instead.
    client.on('error', (err: Error) => logger.error('Redis client error', { error: err }));

    return client;
  },
};

/**
 * Global Redis foundation: a single shared ioredis connection (from REDIS_URL)
 * plus the RedisService wrapper. Redis backs three subsystems in Kavio —
 * BullMQ queues, the rate-limit store, and the WS pub/sub adapter (SRS §17, §24.1).
 */
@Global()
@Module({
  providers: [redisClientProvider, RedisService],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(private readonly redis: RedisService) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.client.quit().catch(() => this.redis.client.disconnect());
  }
}
