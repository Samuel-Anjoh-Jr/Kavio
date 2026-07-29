import { BookingStatus, EscrowState, JobStatus } from '@kavio/database';
import {
  bookingStatusForEscrowState,
  canTransitionEscrow,
  ESCROW_TRANSITIONS,
  isEscrowTransitionAllowedFor,
  isTerminalEscrowState,
  jobStatusForEscrowState,
  TERMINAL_ESCROW_STATES,
} from './escrow-lifecycle.model';

/**
 * The escrow machine is pure, so it is tested exhaustively — this is the file that
 * proves illegal money moves are rejected and the freeze actually freezes.
 */
describe('escrow-lifecycle.model', () => {
  it('reproduces the SRS §15.1 legal moves', () => {
    expect(canTransitionEscrow(EscrowState.PAID, EscrowState.ACCEPTED)).toBe(true);
    expect(canTransitionEscrow(EscrowState.ACCEPTED, EscrowState.IN_PROGRESS)).toBe(true);
    expect(canTransitionEscrow(EscrowState.IN_PROGRESS, EscrowState.COMPLETED)).toBe(true);
    expect(canTransitionEscrow(EscrowState.COMPLETED, EscrowState.RELEASED)).toBe(true);
    expect(canTransitionEscrow(EscrowState.PAID, EscrowState.REFUNDED)).toBe(true);
    expect(canTransitionEscrow(EscrowState.IN_PROGRESS, EscrowState.DISPUTED)).toBe(true);
    expect(canTransitionEscrow(EscrowState.DISPUTED, EscrowState.RELEASED)).toBe(true);
    expect(canTransitionEscrow(EscrowState.DISPUTED, EscrowState.REFUNDED)).toBe(true);
  });

  it('rejects skips and reversals', () => {
    expect(canTransitionEscrow(EscrowState.PAID, EscrowState.RELEASED)).toBe(false);
    expect(canTransitionEscrow(EscrowState.PAID, EscrowState.COMPLETED)).toBe(false);
    expect(canTransitionEscrow(EscrowState.RELEASED, EscrowState.REFUNDED)).toBe(false);
    expect(canTransitionEscrow(EscrowState.COMPLETED, EscrowState.IN_PROGRESS)).toBe(false);
  });

  it('marks RELEASED and REFUNDED terminal', () => {
    expect(TERMINAL_ESCROW_STATES).toEqual(
      expect.arrayContaining([EscrowState.RELEASED, EscrowState.REFUNDED]),
    );
    expect(isTerminalEscrowState(EscrowState.RELEASED)).toBe(true);
    expect(isTerminalEscrowState(EscrowState.DISPUTED)).toBe(false);
    expect(ESCROW_TRANSITIONS[EscrowState.RELEASED]).toHaveLength(0);
  });

  it('freezes a disputed hold from every party — only SYSTEM can move it', () => {
    expect(isEscrowTransitionAllowedFor(EscrowState.DISPUTED, EscrowState.RELEASED, 'CLIENT')).toBe(
      false,
    );
    expect(isEscrowTransitionAllowedFor(EscrowState.DISPUTED, EscrowState.RELEASED, 'WORKER')).toBe(
      false,
    );
    expect(isEscrowTransitionAllowedFor(EscrowState.DISPUTED, EscrowState.RELEASED, 'SYSTEM')).toBe(
      true,
    );
  });

  it('lets a party open a dispute but not declare their own refund', () => {
    expect(
      isEscrowTransitionAllowedFor(EscrowState.IN_PROGRESS, EscrowState.DISPUTED, 'CLIENT'),
    ).toBe(true);
    expect(
      isEscrowTransitionAllowedFor(EscrowState.IN_PROGRESS, EscrowState.DISPUTED, 'WORKER'),
    ).toBe(true);
    expect(isEscrowTransitionAllowedFor(EscrowState.PAID, EscrowState.REFUNDED, 'CLIENT')).toBe(
      false,
    );
  });

  it('only the client can confirm completion (release the payout)', () => {
    expect(
      isEscrowTransitionAllowedFor(EscrowState.COMPLETED, EscrowState.RELEASED, 'CLIENT'),
    ).toBe(true);
    expect(
      isEscrowTransitionAllowedFor(EscrowState.COMPLETED, EscrowState.RELEASED, 'WORKER'),
    ).toBe(false);
  });

  it('mirrors every escrow state onto a booking status name-for-name', () => {
    expect(bookingStatusForEscrowState(EscrowState.PAID)).toBe(BookingStatus.PAID);
    expect(bookingStatusForEscrowState(EscrowState.ACCEPTED)).toBe(BookingStatus.ACCEPTED);
    expect(bookingStatusForEscrowState(EscrowState.RELEASED)).toBe(BookingStatus.RELEASED);
    expect(bookingStatusForEscrowState(EscrowState.DISPUTED)).toBe(BookingStatus.DISPUTED);
  });

  it('drives the job lifecycle only where the job has a matching rung', () => {
    expect(jobStatusForEscrowState(EscrowState.PAID)).toBeNull();
    expect(jobStatusForEscrowState(EscrowState.ACCEPTED)).toBeNull();
    expect(jobStatusForEscrowState(EscrowState.IN_PROGRESS)).toBe(JobStatus.IN_PROGRESS);
    expect(jobStatusForEscrowState(EscrowState.RELEASED)).toBe(JobStatus.RELEASED);
    expect(jobStatusForEscrowState(EscrowState.REFUNDED)).toBe(JobStatus.REFUNDED);
  });
});
