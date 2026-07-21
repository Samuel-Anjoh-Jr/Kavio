import { TransactionDirection, TransactionType } from '@trustpro/database';
import { LedgerService } from './ledger.service';

/**
 * The direction map is what stops a refund from ever being recorded as a debit —
 * a single typo there would misreport every history row, so it is pinned here.
 */
describe('LedgerService.directionFor', () => {
  it('treats money that lands in the wallet as a CREDIT', () => {
    expect(LedgerService.directionFor(TransactionType.DEPOSIT)).toBe(TransactionDirection.CREDIT);
    expect(LedgerService.directionFor(TransactionType.ESCROW_RELEASE)).toBe(
      TransactionDirection.CREDIT,
    );
    expect(LedgerService.directionFor(TransactionType.REFUND)).toBe(TransactionDirection.CREDIT);
  });

  it('treats money leaving the owner as a DEBIT', () => {
    expect(LedgerService.directionFor(TransactionType.PAYMENT)).toBe(TransactionDirection.DEBIT);
    expect(LedgerService.directionFor(TransactionType.ESCROW_HOLD)).toBe(
      TransactionDirection.DEBIT,
    );
    expect(LedgerService.directionFor(TransactionType.FEE)).toBe(TransactionDirection.DEBIT);
    expect(LedgerService.directionFor(TransactionType.WITHDRAWAL)).toBe(TransactionDirection.DEBIT);
  });

  it('covers every transaction type (exhaustive switch)', () => {
    for (const type of Object.values(TransactionType)) {
      expect(Object.values(TransactionDirection)).toContain(LedgerService.directionFor(type));
    }
  });
});
