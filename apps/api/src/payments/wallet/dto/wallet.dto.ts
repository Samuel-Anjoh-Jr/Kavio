import { z } from 'zod';
import { WALLET_MAX_AMOUNT, WALLET_MIN_AMOUNT } from '../../payments.config';

/**
 * Wallet writes (PAY-05). REST, per the DUAL API RULE. Amounts are whole XAF.
 */
const amount = z
  .number()
  .int('Enter a whole number of XAF — there are no centimes.')
  .min(WALLET_MIN_AMOUNT, `Enter at least ${WALLET_MIN_AMOUNT} XAF.`)
  .max(WALLET_MAX_AMOUNT, 'That amount looks like a typo. Check the number of zeros.');

/** Add money to the wallet from a payment method (PAY-05 "Add Money"). */
export const addMoneySchema = z.object({
  amount,
  paymentMethodId: z.uuid().optional(),
});
export type AddMoneyDto = z.infer<typeof addMoneySchema>;

/** Withdraw money from the wallet to a payment method (PAY-05 "Withdraw"). */
export const withdrawSchema = z.object({
  amount,
  paymentMethodId: z.uuid().optional(),
});
export type WithdrawDto = z.infer<typeof withdrawSchema>;
