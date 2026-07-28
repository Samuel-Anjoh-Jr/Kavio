import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { NOTIFICATION_REQUESTED, NotificationRequestedEvent } from './events/notification.events';
import { testDispatchSchema, type TestDispatchDto } from './dto/test-dispatch.dto';
import {
  updateNotificationPreferenceSchema,
  updateNotificationSoundSchema,
  type UpdateNotificationPreferenceDto,
  type UpdateNotificationSoundDto,
} from './dto/notification-center.dto';
import { NotificationCenterService } from './notification-center.service';

/**
 * Notification writes (REST, per the DUAL API RULE; NOT-02, SET-02). Reads are on
 * NotificationCenterResolver.
 *
 * No RBAC capability guards the center: an inbox and its preferences belong to the
 * identity, so any authenticated user manages their own — the same reasoning that
 * leaves wallet and safety endpoints without a permission decorator. Scoping is by
 * `userId` in the service's WHERE, never by a client-supplied argument.
 *
 * The dev-only smoke-test endpoint below also demonstrates the mandatory
 * integration pattern: a controller EMITS a typed domain event and never touches
 * a provider, a channel, a template or the queue.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly events: EventEmitter2,
    private readonly center: NotificationCenterService,
  ) {}

  /** Marks one notification read (NOT-02). Idempotent: re-reading updates nothing. */
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ updated: number }> {
    return this.center.markRead(user, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<{ updated: number }> {
    return this.center.markAllRead(user);
  }

  /** Toggles one channel × category preference cell (NOT-02, SET-02). */
  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  async setPreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateNotificationPreferenceSchema))
    dto: UpdateNotificationPreferenceDto,
  ) {
    return this.center.setPreference(user, dto.channel, dto.category, dto.enabled);
  }

  /** Sets one category's custom notification sound (NOT-02). */
  @Patch('sound-preferences')
  @HttpCode(HttpStatus.OK)
  async setSoundPreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateNotificationSoundSchema))
    dto: UpdateNotificationSoundDto,
  ) {
    return this.center.setSoundPreference(user, dto.category, dto.soundKey);
  }

  // Public only because it 404s outside development (see the guard below); a
  // token would otherwise be needed to smoke-test before any account exists.
  @Public()
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
