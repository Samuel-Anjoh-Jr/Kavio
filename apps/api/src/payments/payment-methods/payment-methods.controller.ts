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
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../../lib/zod-validation.pipe';
import {
  addPaymentMethodSchema,
  updatePaymentMethodPhoneSchema,
  type AddPaymentMethodDto,
  type UpdatePaymentMethodPhoneDto,
} from './dto/payment-method.dto';
import { PaymentMethodsService } from './payment-methods.service';

/**
 * Payment-method WRITES (REST, per the DUAL API RULE; PAY-04). Reads are on the
 * payments resolver.
 *
 * No permission decorator: a payment method belongs to the IDENTITY, not a role —
 * a worker receiving payouts and a client paying both manage their own methods —
 * so any authenticated user may, and every query is scoped to `user.id`.
 */
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly methods: PaymentMethodsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(addPaymentMethodSchema)) dto: AddPaymentMethodDto,
  ) {
    return this.methods.add(user, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updatePhone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updatePaymentMethodPhoneSchema)) dto: UpdatePaymentMethodPhoneDto,
  ) {
    return this.methods.updatePhone(user, id, dto);
  }

  @Post(':id/default')
  @HttpCode(HttpStatus.OK)
  async setDefault(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.methods.setDefault(user, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.methods.remove(user, id);
  }
}
