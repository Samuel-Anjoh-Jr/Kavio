import { PaymentMethodType } from '@kavio/database';
import { z } from 'zod';

/**
 * Payment-method writes (PAY-04). REST, per the DUAL API RULE.
 *
 * Mobile Money is identified by an E.164 phone — the number Campay collects from
 * and pays out to; card/bank keep only a masked tail. The schema enforces that
 * split so a MoMo method can never be saved without the one field that makes it
 * usable, and a card can never smuggle a full PAN into `maskedAccount`.
 */

/** E.164, normalised at capture so SMS/MoMo routing needs no call-site change. */
const phone = z
  .string()
  .trim()
  .regex(/^\+?237\d{9}$/, 'Enter a valid Cameroon phone number (+237XXXXXXXXX).');

export const addPaymentMethodSchema = z
  .object({
    type: z.enum(PaymentMethodType),
    label: z.string().trim().min(1).max(60).optional(),
    /** Required for MTN_MOMO / ORANGE_MONEY. */
    phone: phone.optional(),
    /** Last digits only, for card/bank recognition. Never a full number. */
    maskedAccount: z.string().trim().max(8, 'Store only the last few digits.').optional(),
    operator: z.string().trim().max(20).optional(),
    makeDefault: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.type === PaymentMethodType.CARD || v.type === PaymentMethodType.BANK || Boolean(v.phone),
    { message: 'A Mobile Money method needs a phone number.', path: ['phone'] },
  );

export type AddPaymentMethodDto = z.infer<typeof addPaymentMethodSchema>;

/**
 * Updates a Mobile Money method's phone number in place — the number a
 * payout pop-up lets someone confirm or correct before money actually moves,
 * without having to delete and re-add the whole method.
 */
export const updatePaymentMethodPhoneSchema = z.object({ phone });

export type UpdatePaymentMethodPhoneDto = z.infer<typeof updatePaymentMethodPhoneSchema>;
