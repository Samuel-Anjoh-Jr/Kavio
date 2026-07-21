import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { DeviceRegistrationService } from './device-registration.service';
import {
  registerDeviceSchema,
  unregisterDeviceSchema,
  type RegisterDeviceDto,
  type UnregisterDeviceDto,
} from './dto/device-registration.dto';

/**
 * Web-push device registration (REST, per the DUAL API RULE; NOT-01).
 *
 * No RBAC capability: managing your own push subscriptions is an identity-level
 * action, like wallet or safety endpoints. The VAPID PUBLIC key is served here so
 * the browser can call `pushManager.subscribe` — it is public by definition (the
 * private key never leaves the server), but the route still requires a session so
 * only signed-in users subscribe.
 */
@Controller('notifications')
export class DeviceRegistrationController {
  constructor(private readonly devices: DeviceRegistrationService) {}

  @Get('vapid-public-key')
  vapidPublicKey(): { publicKey: string | null } {
    return { publicKey: process.env.VAPID_PUBLIC_KEY ?? null };
  }

  @Post('devices')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(registerDeviceSchema)) dto: RegisterDeviceDto,
  ) {
    return this.devices.register(user.id, dto);
  }

  @Delete('devices')
  @HttpCode(HttpStatus.OK)
  async unregister(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(unregisterDeviceSchema)) dto: UnregisterDeviceDto,
  ) {
    return this.devices.unregister(user.id, dto.endpoint);
  }
}
