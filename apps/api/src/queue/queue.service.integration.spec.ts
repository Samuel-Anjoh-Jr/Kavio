import IORedis from 'ioredis';
import type { Job } from 'bullmq';
import { QueueService } from './queue.service';
import { QUEUE_NAMES } from './queue.constants';
import { parseRedisUrl } from '../redis/redis.util';

/**
 * Integration test against a real Redis. It self-skips (stays green) when Redis
 * is unreachable so CI without a Redis service still passes; run it locally
 * after `pnpm docker:up` to exercise the actual BullMQ retry path.
 */
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = { ...parseRedisUrl(REDIS_URL), maxRetriesPerRequest: null };

async function redisReachable(): Promise<boolean> {
  const probe = new IORedis({ ...connection, retryStrategy: () => null, lazyConnect: true });
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

describe('QueueService (integration)', () => {
  let available = false;
  let service: QueueService;

  beforeAll(async () => {
    available = await redisReachable();
    if (available) {
      service = new QueueService(connection);
      // Start from a clean slate so prior runs don't leak jobs.
      await service
        .getQueue(QUEUE_NAMES.notifications)
        .obliterate({ force: true })
        .catch(() => undefined);
    }
  });

  afterAll(async () => {
    if (service) {
      await service.onApplicationShutdown();
    }
  });

  it('retries a thrown job and eventually processes it', async () => {
    if (!available) {
      console.warn('Skipping: Redis not reachable at ' + REDIS_URL);
      return;
    }

    let attempts = 0;
    const completed = new Promise<Job>((resolve, reject) => {
      const worker = service.registerWorker(
        QUEUE_NAMES.notifications,
        async () => {
          await Promise.resolve();
          attempts += 1;
          if (attempts < 2) {
            throw new Error('transient failure');
          }
          return { ok: true };
        },
        { concurrency: 1 },
      );
      worker.on('completed', (job) => resolve(job));
      worker.on('error', reject);
    });

    await service.enqueue(
      QUEUE_NAMES.notifications,
      'test-job',
      { hello: 'world' },
      { attempts: 3, backoff: { type: 'fixed', delay: 50 } },
    );

    await completed;
    // First attempt threw, second succeeded — proves the retry policy ran.
    expect(attempts).toBe(2);
  }, 20_000);
});
