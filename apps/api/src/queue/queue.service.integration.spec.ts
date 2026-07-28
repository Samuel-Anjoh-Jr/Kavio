import IORedis from 'ioredis';
import type { Job } from 'bullmq';
import { QueueService } from './queue.service';
import { QUEUE_NAMES } from './queue.constants';
import { parseRedisUrl } from '../redis/redis.util';

/**
 * Integration test against a real Redis. It self-skips (stays green) when Redis
 * is unreachable so CI without a Redis service still passes; run it locally
 * after `pnpm docker:up` to exercise the actual BullMQ retry path.
 *
 * ── Why this runs on its own Redis database ─────────────────────────────────
 *
 * The queue name below is the REAL `notifications` queue, and a BullMQ queue is
 * just a set of Redis keys — so any other consumer pointed at the same database
 * is a competing worker, not a bystander. With the API running locally (which
 * registers exactly that worker in its own onModuleInit), the app would pick up
 * this test's job first, and the worker created here would sit waiting for a
 * `completed` event that had already been delivered to somebody else. That
 * failed as an opaque 20s timeout, and only ever when a dev server happened to
 * be up — which reads as flakiness but is a missing isolation boundary.
 *
 * Pinning the test to its own logical database gives it a private keyspace, so
 * a running app, a second test run, or a colleague's local stack cannot reach
 * the jobs it enqueues.
 */
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * Redis ships with 16 logical databases (0-15) and applications overwhelmingly
 * use 0, so the far end of the range is the one least likely to be occupied.
 * Override with TEST_REDIS_DB if a deployment restricts `databases`.
 */
const TEST_REDIS_DB = Number(process.env.TEST_REDIS_DB ?? 15);

const connection = {
  ...parseRedisUrl(REDIS_URL),
  db: TEST_REDIS_DB,
  maxRetriesPerRequest: null,
};

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

    const completed = new Promise<Job>((resolve, reject) => {
      worker.on('completed', (job) => resolve(job));
      worker.on('error', reject);
    });

    // Attach the listeners and let the worker finish connecting BEFORE the job
    // exists. BullMQ would deliver a job enqueued first anyway, but waiting here
    // means a failure can only mean "the retry did not happen", never "the
    // worker was still starting up" — which is the difference between a test
    // that reports a bug and one that reports a race.
    await worker.waitUntilReady();

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
