import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../../lib/zod-validation.pipe';
import {
  addMoneySchema,
  withdrawSchema,
  type AddMoneyDto,
  type WithdrawDto,
} from './dto/wallet.dto';
import { WalletService } from './wallet.service';

/**
 * Wallet WRITES (REST, per the DUAL API RULE; PAY-05). Reads (balance, escrow,
 * last transaction) are on the payments resolver.
 *
 * No permission decorator: a wallet belongs to the IDENTITY. A client withdraws a
 * refund and a worker withdraws a payout through the very same endpoint, so
 * gating it on a role would lock one of them out of their own money.
 */
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Post('add-money')
  @HttpCode(HttpStatus.CREATED)
  async addMoney(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(addMoneySchema)) dto: AddMoneyDto,
  ) {
    return this.wallet.addMoney(user, dto);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.CREATED)
  async withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(withdrawSchema)) dto: WithdrawDto,
  ) {
    return this.wallet.withdraw(user, dto);
  }
}
