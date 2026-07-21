import { Injectable, OnModuleInit } from '@nestjs/common';
import { NotificationStatus } from '@trustpro/database';
import type { Job } from 'bullmq';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { QUEUE_NAMES } from '../queue/queue.constants';
import type { NotificationDeliveryJob } from './notification.types';
import { NotificationProviderRegistry } from './providers/provider.registry';
import { renderTemplate, isTemplateKey } from './templates/template.registry';

const logger = createLogger('notifications:delivery');

/**
 * Consumes the BullMQ "notifications" queue: renders the template for the target
 * channel + locale, hands it to the provider, and closes out the NotificationLog
 * row as SENT or FAILED.
 *
 * Throwing lets BullMQ apply the shared retry/backoff policy and, once attempts
 * are exhausted, move the job to the dead-letter queue (QueueService). The log
 * row is updated on every attempt, so a failed delivery is always visible with
 * its provider error rather than disappearing.
 */
@Injectable()
export class NotificationDeliveryProcessor implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: NotificationProviderRegistry,
    private readonly queue: QueueService,
  ) {}

  onModuleInit(): void {
    this.queue.registerWorker<NotificationDeliveryJob>(QUEUE_NAMES.notifications, (job) =>
      this.process(job),
    );
  }

  async process(job: Job<NotificationDeliveryJob>): Promise<void> {
    const start = Date.now();
    const { logId, channel, address, templateKey, locale, variables } = job.data;

    if (!isTemplateKey(templateKey)) {
      // A job queued against a template that has since been removed. Fail it
      // permanently rather than retrying a job that can never succeed.
      await this.markFailed(logId, `Unknown templateKey "${templateKey}"`, job.attemptsMade);
      return;
    }

    const provider = this.providers.get(channel);
    if (!provider) {
      await this.markFailed(
        logId,
        `No provider registered for channel ${channel}`,
        job.attemptsMade,
      );
      return;
    }

    const message = renderTemplate(templateKey, channel, locale, variables);
    if (!message) {
      await this.markFailed(
        logId,
        `Template "${templateKey}" has no ${channel} content`,
        job.attemptsMade,
      );
      return;
    }

    const subject = message.channel === 'EMAIL' ? message.content.subject : null;

    try {
      await provider.send(address, message);

      await this.prisma.client.notificationLog.update({
        where: { id: logId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          errorMessage: null,
          ...(subject ? { subject } : {}),
        },
      });

      logger.info('Notification delivered', {
        durationMs: Date.now() - start,
        result: { logId, channel, templateKey, provider: provider.providerName },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.markFailed(logId, reason, job.attemptsMade, subject);

      logger.error('Notification delivery failed', {
        durationMs: Date.now() - start,
        payload: { logId, channel, templateKey, attempt: job.attemptsMade },
        error,
      });

      // Rethrow so BullMQ retries with backoff and dead-letters on exhaustion.
      throw error;
    }
  }

  /** Records the failure on the existing attempt row (never creates a new one). */
  private async markFailed(
    logId: string,
    errorMessage: string,
    attempt: number,
    subject?: string | null,
  ): Promise<void> {
    await this.prisma.client.notificationLog.update({
      where: { id: logId },
      data: {
        status: NotificationStatus.FAILED,
        // Truncated: this is provider output and must not bloat the row.
        errorMessage: errorMessage.slice(0, 500),
        ...(subject ? { subject } : {}),
      },
    });

    logger.warn('Notification attempt marked FAILED', {
      payload: { logId, attempt, reason: errorMessage.slice(0, 200) },
    });
  }
}
