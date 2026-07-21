import { z } from 'zod';

/**
 * Booking-payment writes (PAY-01, PAY-02). REST, per the DUAL API RULE.
 *
 * The ~10% fee is shown to the client BEFORE this call (it is read off the
 * booking, snapshotted at acceptance), so paying takes only the choice of which
 * method to charge — the default when omitted.
 */
export const payBookingSchema = z.object({
  /** Which saved method to charge. Omitted → the user's default method. */
  paymentMethodId: z.uuid().optional(),
});

export type PayBookingDto = z.infer<typeof payBookingSchema>;
