import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../../lib/zod-validation.pipe';
import {
  disputeMessageSchema,
  openDisputeSchema,
  resolveDisputeSchema,
  type DisputeMessageDto,
  type OpenDisputeDto,
  type ResolveDisputeDto,
} from './dto/dispute.dto';
import { DisputesService } from './disputes.service';

/**
 * Dispute WRITES (REST, per the DUAL API RULE; PAY-03, ADM-05). Reads are on the
 * payments resolver.
 *
 * `dispute:open` is granted to both Client and Worker, so either party can raise
 * one; `admin:dispute_resolve` gates the resolution that drives the escrow. Adding
 * a message has no capability gate — participation is checked in the service, so a
 * party or the resolving admin can post but a stranger cannot.
 */
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('dispute:open')
  async open(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(openDisputeSchema)) dto: OpenDisputeDto,
  ) {
    return this.disputes.open(user, dto);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  async addMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(disputeMessageSchema)) dto: DisputeMessageDto,
  ) {
    return this.disputes.addMessage(user, id, dto);
  }

  /** Admin resolution (ADM-05): the chosen action drives the escrow machine. */
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('admin:dispute_resolve')
  async resolve(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(resolveDisputeSchema)) dto: ResolveDisputeDto,
  ) {
    return this.disputes.resolve(admin, id, dto);
  }
}
