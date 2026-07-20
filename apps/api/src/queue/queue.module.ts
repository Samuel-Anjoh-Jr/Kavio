import { Global, Module, Provider } from '@nestjs/common';
import type { RedisOptions } from 'ioredis';
import { parseRedisUrl } from '../redis/redis.util';
import { BULL_CONNECTION } from './queue.tokens';
import { QueueService } from './queue.service';

/**
 * BullMQ builds its own dedicated (blocking) connections from these options
 * rather than sharing the RedisModule client, so long-running BRPOPLPUSH waits
 * never block rate-limit lookups or WS pub/sub on the shared connection.
 */
const bullConnectionProvider: Provider = {
  provide: BULL_CONNECTION,
  useFactory: (): RedisOptions => {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL is not set — required for BullMQ queues.');
    }
    return {
      ...parseRedisUrl(url),
      // Required by BullMQ workers (blocking commands must not time out).
      maxRetriesPerRequest: null,
    };
  },
};

/**
 * Global queue foundation: the "notifications" and "webhooks" work queues plus
 * a "dead-letter" queue, exposed through QueueService (enqueue + worker
 * registration). Feature modules inject QueueService (SRS §17, §24.1).
 */
@Global()
@Module({
  providers: [bullConnectionProvider, QueueService],
  exports: [QueueService],
})
export class QueueModule {}
