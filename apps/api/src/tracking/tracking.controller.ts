import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { startTrackingSchema, type StartTrackingDto } from './dto/tracking.dto';
import { TrackingService } from './tracking.service';

/**
 * Live-tracking WRITES (REST, per the DUAL API RULE; SOS-03). The position stream
 * itself is on the WebSocket gateway; these manage the session's lifecycle and
 * consent. No RBAC capability guards them — sharing your own location is an
 * identity-level action, and the service authorises the worker/viewer roles by
 * the booking, not by a permission.
 */
@Controller('tracking')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  /** A worker starts sharing their live location for a booking (explicit consent). */
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(startTrackingSchema)) dto: StartTrackingDto,
  ) {
    return this.tracking.startSession(user, dto);
  }

  /** The worker revokes consent — the stream stops immediately. */
  @Post('sessions/:id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tracking.revokeConsent(user, id);
  }

  /** Either party ends the session (arrival, or the screen was closed). */
  @Post('sessions/:id/end')
  @HttpCode(HttpStatus.OK)
  async end(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.tracking.endSession(user, id);
  }
}
