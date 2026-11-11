import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ESCROW_REFUNDED, ESCROW_WORK_ACCEPTED } from '../../payments/events/payment.events';
import { QUOTE_SENT } from '../../quotes/events/quote.events';
import { JOB_APPLICATION_SUBMITTED, JOB_STATUS_CHANGED } from '../../jobs/events/job.events';
import { AlertService } from './alert.service';

/**
 * Stops rings and escalation as soon as nobody needs to act any more:
 * the worker accepted the funded booking (or it was refunded), or the
 * invited worker answered (quote / application), or the job closed.
 */
@Injectable()
export class AlertsListener {
  constructor(private readonly alerts: AlertService) {}

  @OnEvent(ESCROW_WORK_ACCEPTED, { async: true })
  async onWorkAccepted(event: { bookingId: string }): Promise<void> {
    await this.alerts.resolve('booking', event.bookingId, 'accepted');
  }

  @OnEvent(ESCROW_REFUNDED, { async: true })
  async onRefunded(event: { bookingId: string }): Promise<void> {
    await this.alerts.resolve('booking', event.bookingId, 'refunded');
  }

  @OnEvent(QUOTE_SENT, { async: true })
  async onQuoteSent(event: { jobId: string; workerId: string }): Promise<void> {
    await this.alerts.resolve('job', event.jobId, 'quoted', event.workerId);
  }

  @OnEvent(JOB_APPLICATION_SUBMITTED, { async: true })
  async onApplied(event: { jobId: string; workerId: string }): Promise<void> {
    await this.alerts.resolve('job', event.jobId, 'applied', event.workerId);
  }

  @OnEvent(JOB_STATUS_CHANGED, { async: true })
  async onJobStatus(event: { jobId: string; toStatus: string }): Promise<void> {
    if (['CANCELLED', 'ARCHIVED', 'ACCEPTED', 'IN_PROGRESS'].includes(event.toStatus)) {
      await this.alerts.resolve('job', event.jobId, `status:${event.toStatus}`);
    }
  }
}
