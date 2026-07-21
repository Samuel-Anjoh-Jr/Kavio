/**
 * The platform fee split, as a PURE function (PAY-01, SRS §21).
 *
 * The fee (~10%) is shown to the client BEFORE they pay and then snapshotted onto
 * the booking, so the maths that turns an agreed price into a fee and a payout
 * has to be one reviewed, tested function — not something each call site does by
 * hand with its own rounding. XAF has no minor unit, so every amount is a whole
 * integer and rounding is a real decision, made once, here.
 */

/** The default platform fee in basis points. 1000 bps = 10% (SRS §21 "~10%"). */
export const DEFAULT_PLATFORM_FEE_BPS = 1000;

export interface FeeSplit {
  readonly agreedPrice: number;
  readonly platformFeeBps: number;
  readonly platformFeeAmount: number;
  readonly workerPayoutAmount: number;
}

/**
 * Splits an agreed price into the platform fee and the worker's payout.
 *
 * The fee is ROUNDED DOWN (floor). The house taking the fractional franc rather
 * than the worker is the conventional, defensible choice, and — more importantly
 * — flooring the fee and deriving the payout as the remainder guarantees the two
 * always add back to exactly the agreed price. That identity is what the
 * Booking_amounts_check CHECK constraint enforces at the database, so a rounding
 * rule that broke it would fail the write rather than silently lose a franc.
 */
export function computeFeeSplit(
  agreedPrice: number,
  feeBps: number = DEFAULT_PLATFORM_FEE_BPS,
): FeeSplit {
  if (!Number.isInteger(agreedPrice) || agreedPrice <= 0) {
    throw new Error(`agreedPrice must be a positive integer, got ${agreedPrice}`);
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error(`feeBps must be an integer in [0, 10000], got ${feeBps}`);
  }

  const platformFeeAmount = Math.floor((agreedPrice * feeBps) / 10_000);
  const workerPayoutAmount = agreedPrice - platformFeeAmount;

  return {
    agreedPrice,
    platformFeeBps: feeBps,
    platformFeeAmount,
    workerPayoutAmount,
  };
}
