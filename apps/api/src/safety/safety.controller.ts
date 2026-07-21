import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import {
  createEmergencyContactSchema,
  resolveSosSchema,
  triggerSosSchema,
  updateEmergencyContactSchema,
  updateSosLocationSchema,
  type CreateEmergencyContactDto,
  type ResolveSosDto,
  type TriggerSosDto,
  type UpdateEmergencyContactDto,
  type UpdateSosLocationDto,
} from './dto/sos.dto';
import { SafetyService } from './safety.service';

/**
 * Safety & SOS WRITES (REST, per the DUAL API RULE; SOS-01, SOS-02, SOS-03).
 * Reads are on SafetyResolver.
 *
 * No RBAC capability guards these: safety belongs to the identity, so any
 * authenticated user can raise an SOS and manage their own emergency contacts —
 * exactly like wallet/payment-method endpoints, which carry no permission
 * decorator for the same reason (money and safety attach to the person).
 */
@Controller()
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  /** Triggering is rate-limited to blunt accidental double-taps, not to gate it. */
  @Post('sos')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async trigger(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(triggerSosSchema)) dto: TriggerSosDto,
  ) {
    return this.safety.triggerSos(user, dto);
  }

  @Post('sos/:id/location')
  @HttpCode(HttpStatus.OK)
  async updateLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateSosLocationSchema)) dto: UpdateSosLocationDto,
  ) {
    return this.safety.updateLocation(user, id, dto);
  }

  @Post('sos/:id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(resolveSosSchema)) dto: ResolveSosDto,
  ) {
    return this.safety.resolve(user, id, dto);
  }

  @Post('emergency-contacts')
  @HttpCode(HttpStatus.CREATED)
  async addContact(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createEmergencyContactSchema)) dto: CreateEmergencyContactDto,
  ) {
    return this.safety.addContact(user, dto);
  }

  @Patch('emergency-contacts/:id')
  @HttpCode(HttpStatus.OK)
  async updateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateEmergencyContactSchema)) dto: UpdateEmergencyContactDto,
  ) {
    return this.safety.updateContact(user, id, dto);
  }

  @Delete('emergency-contacts/:id')
  @HttpCode(HttpStatus.OK)
  async removeContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.safety.removeContact(user, id);
  }
}
