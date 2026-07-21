import { computeFeeSplit, DEFAULT_PLATFORM_FEE_BPS } from './booking-fee.model';

describe('booking fee split (PAY-01, SRS §21)', () => {
  it('takes ~10% by default and pays the worker the rest', () => {
    const split = computeFeeSplit(25_000);
    expect(split.platformFeeBps).toBe(DEFAULT_PLATFORM_FEE_BPS);
    expect(split.platformFeeAmount).toBe(2_500);
    expect(split.workerPayoutAmount).toBe(22_500);
  });

  it('always splits back to exactly the agreed price (the DB CHECK invariant)', () => {
    // The Booking_amounts_check constraint requires fee + payout = agreedPrice.
    // Fuzz a range of awkward amounts to be sure the rounding never breaks it.
    for (const price of [1, 3, 7, 99, 12_345, 999_999, 33_333, 100_000_000]) {
      const split = computeFeeSplit(price);
      expect(split.platformFeeAmount + split.workerPayoutAmount).toBe(price);
      expect(split.platformFeeAmount).toBeGreaterThanOrEqual(0);
      expect(split.workerPayoutAmount).toBeGreaterThanOrEqual(0);
    }
  });

  it('floors the fee, so the fractional franc goes to the house not the worker', () => {
    // 10% of 12,345 is 1,234.5 → floored to 1,234; payout is the remainder.
    const split = computeFeeSplit(12_345);
    expect(split.platformFeeAmount).toBe(1_234);
    expect(split.workerPayoutAmount).toBe(11_111);
  });

  it('honours a configured fee rate', () => {
    const split = computeFeeSplit(10_000, 500); // 5%
    expect(split.platformFeeAmount).toBe(500);
    expect(split.workerPayoutAmount).toBe(9_500);
  });

  it('rejects nonsense inputs rather than storing a broken split', () => {
    expect(() => computeFeeSplit(0)).toThrow();
    expect(() => computeFeeSplit(-100)).toThrow();
    expect(() => computeFeeSplit(1000.5)).toThrow();
    expect(() => computeFeeSplit(1000, 20_000)).toThrow();
    expect(() => computeFeeSplit(1000, -1)).toThrow();
  });
});
