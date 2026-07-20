import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Job, JobsOptions, Processor, Queue, Worker, WorkerOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { createLogger } from '../lib/logger';
import { BULL_CONNECTION } from './queue.tokens';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES, QueueName, WORK_QUEUES } from './queue.constants';

const logger = createLogger('queue');

/**
 * Central BullMQ access point. Owns one Queue per named queue and the workers
 * registered against them, applies the default retry/backoff policy on enqueue,
 * and moves jobs that exhaust their retries onto the dead-letter queue.
 *
 * Processor registration pattern: a feature module (e.g. the notification
 * dispatcher) injects QueueService and, in its onModuleInit, calls
 * `registerWorker(QUEUE_NAMES.notifications, processorFn)`. Business modules
 * never construct BullMQ Queues/Workers directly.
 */
@Injectable()
export class QueueService implements OnApplicationShutdown {
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];

  constructor(@Inject(BULL_CONNECTION) private readonly connection: RedisOptions) {
    for (const name of Object.values(QUEUE_NAMES)) {
      this.queues.set(
        name,
        new Queue(name, { connection: this.connection, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
      );
    }
  }

  getQueue(name: QueueName): Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Unknown queue "${name}"`);
    }
    return queue;
  }

  /** Enqueue a job; per-job options override the default retry/backoff policy. */
  async enqueue<T = unknown>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: JobsOptions,
  ): Promise<Job<T>> {
    const job = await this.getQueue(queueName).add(jobName, data, options);
    logger.info('Job enqueued', { payload: { queue: queueName, jobName, jobId: job.id } });
    return job as Job<T>;
  }

  /**
   * Register a worker/processor for a queue. Wires structured logging and the
   * dead-letter safety net (a job that fails on its final attempt is copied to
   * the dead-letter queue with its failure context). Returns the Worker so
   * callers can await `.close()` in tests.
   */
  registerWorker<T = unknown, R = unknown>(
    queueName: QueueName,
    processor: Processor<T, R>,
    options?: Omit<WorkerOptions, 'connection'>,
  ): Worker<T, R> {
    const worker = new Worker<T, R>(queueName, processor, {
      ...options,
      connection: this.connection,
    });

    worker.on('completed', (job: Job<T, R>) => {
      logger.info('Job completed', {
        payload: { queue: queueName, jobId: job.id, name: job.name },
      });
    });

    worker.on('failed', (job: Job<T, R> | undefined, err: Error) => {
      if (!job) {
        logger.error('Job failed (no job context)', { payload: { queue: queueName }, error: err });
        return;
      }
      const attempts = job.opts.attempts ?? 1;
      const exhausted = job.attemptsMade >= attempts;
      logger.warn('Job attempt failed', {
        payload: {
          queue: queueName,
          jobId: job.id,
          name: job.name,
          attempt: job.attemptsMade,
          maxAttempts: attempts,
          exhausted,
          error: err,
        },
      });
      if (exhausted && queueName !== QUEUE_NAMES.deadLetter) {
        void this.moveToDeadLetter(queueName, job, err);
      }
    });

    worker.on('error', (err: Error) => {
      logger.error('Worker error', { payload: { queue: queueName }, error: err });
    });

    this.workers.push(worker);
    logger.info('Worker registered', { payload: { queue: queueName } });
    return worker;
  }

  private async moveToDeadLetter<T, R>(
    queueName: QueueName,
    job: Job<T, R>,
    err: Error,
  ): Promise<void> {
    try {
      await this.getQueue(QUEUE_NAMES.deadLetter).add('dead', {
        originalQueue: queueName,
        originalJobId: job.id,
        name: job.name,
        data: job.data,
        failedReason: err.message,
        attemptsMade: job.attemptsMade,
        failedAt: new Date().toISOString(),
      });
      logger.error('Job moved to dead-letter queue', {
        payload: { queue: queueName, jobId: job.id, name: job.name },
      });
    } catch (dlErr) {
      logger.error('Failed to move job to dead-letter queue', {
        payload: { queue: queueName, jobId: job.id },
        error: dlErr,
      });
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close().catch(() => undefined)));
    await Promise.all([...this.queues.values()].map((q) => q.close().catch(() => undefined)));
  }
}

export { QUEUE_NAMES, WORK_QUEUES };
