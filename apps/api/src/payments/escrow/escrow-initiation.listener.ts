import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { createLogger } from '../../lib/logger';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../../notifications/events/notification.events';
import {
  ESCROW_INITIATION_REQUESTED,
  EscrowInitiationRequestedEvent,
} from '../../quotes/events/quote.events';

/**
 * Consumes the seam BookingsService left open (PROMPT 60). When a quote is
 * accepted a booking is created PENDING_PAYMENT and this event fires — the
 * payments module's cue that money now needs collecting.
 *
 * It does NOT auto-charge: funding is an explicit client action (choose a method,
 * see the ~10% fee, approve the Mobile Money prompt), so all this does is notify
 * the client that their booking is waiting to be paid into escrow. The actual
 * collection is `POST /bookings/:id/pay`.
 */
@Injectable()
export class EscrowInitiationListener {
  private readonly logger = createLogger('escrow-initiation');

  constructor(private readonly events: EventEmitter2) {}

  @OnEvent(ESCROW_INITIATION_REQUESTED)
  onInitiationRequested(event: EscrowInitiationRequestedEvent): void {
    this.logger.info('Escrow initiation requested; awaiting client payment', {
      payload: { bookingId: event.bookingId, amount: event.agreedPrice },
    });

    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: event.clientId,
        templateKey: 'payment.required',
        variables: { amount: event.agreedPrice },
        requestId: event.requestId,
      }),
    );
  }
}
