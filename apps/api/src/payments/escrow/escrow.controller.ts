import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../../lib/zod-validation.pipe';
import { payBookingSchema, type PayBookingDto } from './dto/escrow.dto';
import { EscrowPaymentService } from './escrow-payment.service';
import { EscrowService } from './escrow.service';

/**
 * Booking / escrow WRITES (REST, per the DUAL API RULE; PAY-01, PAY-02).
 *
 * The endpoints are the escrow state machine's edges. Permissions split by who
 * drives which move — the client funds and confirms (`payment:pay`), the worker
 * accepts, starts and completes (`payment:receive`) — and the service double-checks
 * the caller is actually that party to the booking, so the capability is the outer
 * gate and party membership the inner one. Cancellation is open to either party
 * (the service verifies membership) because a booking can be called off from both
 * sides before work begins.
 */
@Controller('bookings')
export class EscrowController {
  constructor(
    private readonly escrow: EscrowService,
    private readonly payment: EscrowPaymentService,
  ) {}

  /** Client funds the escrow via Campay (PAY-01). The fee was shown before this. */
  @Post(':id/pay')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('payment:pay')
  async pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(payBookingSchema)) dto: PayBookingDto,
  ) {
    return this.payment.payBooking(user, id, dto);
  }

  /** Worker acknowledges the funded booking (PAID → ACCEPTED). */
  @Post(':id/accept-work')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('payment:receive')
  async acceptWork(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.escrow.acceptWork(user, id);
  }

  /** Worker starts the work (ACCEPTED → IN_PROGRESS). */
  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('payment:receive')
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.escrow.start(user, id);
  }

  /** Worker marks the work done (IN_PROGRESS → COMPLETED). */
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('payment:receive')
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.escrow.complete(user, id);
  }

  /** Client confirms completion, releasing the payout (COMPLETED → RELEASED). */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('payment:pay')
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.escrow.confirmCompletion(user, id);
  }

  /**
   * Either party cancels before work begins, refunding the client. No permission
   * decorator — both parties can cancel — the service asserts membership.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.escrow.cancel(user, id);
  }
}
