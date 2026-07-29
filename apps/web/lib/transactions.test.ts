import { describe, expect, it } from 'vitest';
import { formatDateTime } from './datetime';
import { parseBudget, jobMilestoneIndex, isJobException, JOB_MILESTONES } from './jobs';
import { escrowMilestoneIndex, isEscrowException, ESCROW_MILESTONES } from './quotes';
import { estimateFee, isCredit } from './payments';

describe('estimateFee', () => {
  it('takes a ~10% platform fee and leaves the rest for the worker', () => {
    const fee = estimateFee(25_000);
    expect(fee.fee).toBe(2_500);
    expect(fee.workerPayout).toBe(22_500);
    expect(fee.price).toBe(25_000);
  });

  it('rounds the fee to whole XAF — there is no minor unit', () => {
    // 10% of 25 555 is 2 555.5, which must not render as centimes.
    const fee = estimateFee(25_555);
    expect(Number.isInteger(fee.fee)).toBe(true);
    expect(fee.fee + fee.workerPayout).toBe(25_555);
  });
});

describe('isCredit', () => {
  it('treats releases and refunds as money arriving, holds and fees as leaving', () => {
    expect(isCredit('ESCROW_RELEASE')).toBe(true);
    expect(isCredit('REFUND')).toBe(true);
    expect(isCredit('ESCROW_HOLD')).toBe(false);
    expect(isCredit('FEE')).toBe(false);
    expect(isCredit('WITHDRAWAL')).toBe(false);
  });
});

describe('parseBudget', () => {
  it('parses whole francs and drops stray characters', () => {
    expect(parseBudget('25000')).toBe(25_000);
    expect(parseBudget('25 000 XAF')).toBe(25_000);
  });

  it('returns null for empty or zero input', () => {
    expect(parseBudget('')).toBeNull();
    expect(parseBudget('0')).toBeNull();
    expect(parseBudget('abc')).toBeNull();
  });
});

describe('job milestone ladder', () => {
  it('places a status on the ladder and -1 off it', () => {
    expect(jobMilestoneIndex('ACCEPTED')).toBe(0);
    expect(jobMilestoneIndex('RELEASED')).toBe(JOB_MILESTONES.length - 1);
    expect(jobMilestoneIndex('OPEN')).toBe(-1);
  });

  it('flags the exception branches, not the happy path', () => {
    expect(isJobException('DISPUTED')).toBe(true);
    expect(isJobException('CANCELLED')).toBe(true);
    expect(isJobException('IN_PROGRESS')).toBe(false);
  });
});

describe('escrow milestone ladder', () => {
  it('is unreached while awaiting payment, collects at PAID and releases at the end', () => {
    // PENDING_PAYMENT is the state BEFORE its own rung is reached ("fund the
    // escrow to begin") — unlike every other status here, which names
    // something that already happened, so it must not read as complete.
    expect(escrowMilestoneIndex('PENDING_PAYMENT')).toBe(-1);
    expect(escrowMilestoneIndex('PAID')).toBe(1);
    // ACCEPTED (the worker acknowledging a funded booking) has no rung of its
    // own — it reads as the same reached point as PAID.
    expect(escrowMilestoneIndex('ACCEPTED')).toBe(escrowMilestoneIndex('PAID'));
    expect(escrowMilestoneIndex('RELEASED')).toBe(ESCROW_MILESTONES.length - 1);
  });

  it('flags disputed/refunded/cancelled as branches', () => {
    expect(isEscrowException('DISPUTED')).toBe(true);
    expect(isEscrowException('REFUNDED')).toBe(true);
    expect(isEscrowException('PAID')).toBe(false);
  });
});

describe('formatDateTime', () => {
  it('returns null for missing or invalid input', () => {
    expect(formatDateTime(null, 'en')).toBeNull();
    expect(formatDateTime('not-a-date', 'en')).toBeNull();
  });

  it('formats a valid ISO timestamp', () => {
    expect(formatDateTime('2026-07-21T14:30:00Z', 'en')).toBeTruthy();
  });
});
