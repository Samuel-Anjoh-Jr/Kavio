import {
  Body,
  Controller,
  ForbiddenException,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser, Public } from '../../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../../lib/zod-validation.pipe';
import { AlertService } from './alert.service';
import { africasTalkingVoiceXml, loadVoiceScript, toE164Cameroon } from './escalation-providers';

const voiceCallbackSchema = z
  .object({
    callerNumber: z.string().max(32).optional(),
    destinationNumber: z.string().max(32).optional(),
  })
  .passthrough();
type VoiceCallbackDto = z.infer<typeof voiceCallbackSchema>;

const ackSchema = z
  .object({ action: z.enum(['accept', 'decline', 'open', 'dismiss']).optional() })
  .strict();
type AckDto = z.infer<typeof ackSchema>;

/**
 * Acknowledging a ring stops its escalation ladder (REST write).
 *  - POST /alerts/:id/ack?t=<sig>   signed link carried in the push, used by
 *                                   the native ring service and the service
 *                                   worker (no session there)
 *  - POST /alerts/:id/ack/session   the signed-in user, from the ring sheet
 */
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post(':id/ack')
  @HttpCode(HttpStatus.OK)
  async ackWithToken(
    @Param('id') id: string,
    @Query('t') token: string,
    @Body(new ZodValidationPipe(ackSchema)) dto: AckDto,
  ): Promise<{ success: boolean }> {
    if (!token || !this.alerts.verifyAckToken(id, token)) {
      throw new ForbiddenException('Invalid acknowledgement link');
    }
    return { success: await this.alerts.ack(id, dto.action ?? 'open') };
  }

  @Post(':id/ack/session')
  @HttpCode(HttpStatus.OK)
  async ackWithSession(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ackSchema)) dto: AckDto,
  ): Promise<{ success: boolean }> {
    return { success: await this.alerts.ack(id, dto.action ?? 'open', user.id) };
  }

  /**
   * Africa's Talking asks what to say when an escalation call connects (only
   * used when Admin sets the voice provider to africastalking; Twilio voice
   * carries its script inline). Returns the localized voice XML.
   */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post('voice/africastalking')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/xml')
  async voiceCallback(
    @Body(new ZodValidationPipe(voiceCallbackSchema)) body: VoiceCallbackDto,
  ): Promise<string> {
    const to = toE164Cameroon(body.destinationNumber ?? body.callerNumber ?? '');
    return africasTalkingVoiceXml(to ? await loadVoiceScript(to) : undefined);
  }
}
