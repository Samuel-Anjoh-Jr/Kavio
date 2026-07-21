import { Body, Controller, HttpCode, HttpStatus, NotFoundException, Post } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { NOTIFICATION_REQUESTED, NotificationRequestedEvent } from './events/notification.events';
import { testDispatchSchema, type TestDispatchDto } from './dto/test-dispatch.dto';

/**
 * Notification writes (REST, per the DUAL API RULE).
 *
 * Today this exposes only the dev-only smoke-test endpoint proving the dispatcher
 * path end to end. It also demonstrates the mandatory integration pattern: the
 * controller EMITS a typed domain event and never touches a provider, a channel,
 * a template or the queue.
 *
 * The endpoint 404s outside development so it can never be reached in production.
 * User-facing surfaces (notification center, preferences) land in P78.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly events: EventEmitter2) {}

  @Post('test-dispatch')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  testDispatch(@Body(new ZodValidationPipe(testDispatchSchema)) dto: TestDispatchDto): {
    accepted: true;
  } {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }

    this.events.emit(
      NOTIFICATION_REQUESTED,
      new NotificationRequestedEvent({
        userId: dto.userId ?? null,
        templateKey: 'system.test_notification',
        variables: { message: dto.message },
        ...(dto.email ? { to: { email: dto.email } } : {}),
        ...(dto.locale ? { locale: dto.locale } : {}),
      }),
    );

    // Delivery is queued and retried; the caller is not made to wait on a provider.
    return { accepted: true };
  }
}
