import { describe, expect, it } from 'vitest';
import {
  benefitUnlocks,
  canTransition,
  daysWaiting,
  isSuspendingReason,
  isTerminalStage,
  journeyProgress,
  latestAttempt,
  newlyUnlocked,
  stepState,
  WORKER_JOURNEY,
  type VerificationCheckType,
  type VerificationRecord,
} from './verification';

function record(
  checkType: VerificationCheckType,
  overrides: Partial<VerificationRecord> = {},
): VerificationRecord {
  return {
    id: `${checkType}-${overrides.attempt ?? 1}`,
    checkType,
    status: 'VERIFIED',
    stage: 'APPROVED',
    attempt: 1,
    rejectionReason: null,
    rejectionKey: null,
    retryable: true,
    infoRequest: null,
    submittedAt: '2026-07-01T00:00:00.000Z',
    reviewedAt: null,
    ...overrides,
  };
}

describe('latestAttempt', () => {
  it('returns the newest attempt, not the first or the passing one', () => {
    // A worker whose first ID passed and whose re-submission was rejected is
    // currently rejected — picking any VERIFIED row would report the opposite.
    const result = latestAttempt(
      [
        record('ID_APPROVED', { attempt: 1, status: 'VERIFIED' }),
        record('ID_APPROVED', { attempt: 2, status: 'REJECTED' }),
      ],
      'ID_APPROVED',
    );

    expect(result?.attempt).toBe(2);
    expect(result?.status).toBe('REJECTED');
  });

  it('is order-independent', () => {
    const result = latestAttempt(
      [record('PHONE', { attempt: 3 }), record('PHONE', { attempt: 1 })],
      'PHONE',
    );

    expect(result?.attempt).toBe(3);
  });

  it('returns null for a check never attempted', () => {
    expect(latestAttempt([record('PHONE')], 'ADDRESS')).toBeNull();
  });
});

describe('stepState', () => {
  it('reports a never-attempted check as not started', () => {
    expect(stepState(null)).toBe('NOT_STARTED');
  });

  it('separates an outstanding question from ordinary waiting', () => {
    const pending = record('ADDRESS', { status: 'PENDING' });
    const asked = record('ADDRESS', { status: 'PENDING', infoRequest: 'Send the back page too.' });

    expect(stepState(pending)).toBe('PENDING');
    expect(stepState(asked)).toBe('INFO_REQUESTED');
  });

  it('lets a decision outrank an unanswered question', () => {
    // Once it is decided, the earlier request for more info is history.
    const decided = record('ADDRESS', { status: 'VERIFIED', infoRequest: 'Send the back page.' });

    expect(stepState(decided)).toBe('VERIFIED');
  });
});

describe('journeyProgress', () => {
  it('is zero with nothing submitted', () => {
    expect(journeyProgress([])).toMatchObject({ percent: 0, verified: 0, actionable: 0 });
  });

  it('excludes staff-only steps from the denominator (TRU-05)', () => {
    // Six of the seven worker steps are self-serve; FIELD_VERIFICATION is not.
    // A worker who has done everything available to them must read 100%, not 86%.
    const allSelfServe = WORKER_JOURNEY.filter((step) => step.selfServe).map((step) =>
      record(step.checkType),
    );

    const progress = journeyProgress(allSelfServe);

    expect(progress.total).toBe(6);
    expect(progress.percent).toBe(100);
  });

  it('does not credit a staff-only step towards the percentage', () => {
    const progress = journeyProgress([record('FIELD_VERIFICATION')]);

    expect(progress.verified).toBe(0);
    expect(progress.percent).toBe(0);
  });

  it('counts what the worker must act on versus what is waiting on a reviewer', () => {
    const progress = journeyProgress([
      record('PHONE'),
      record('ID_APPROVED', { status: 'REJECTED', rejectionReason: 'OCR_UNREADABLE' }),
      record('ADDRESS', { status: 'PENDING', infoRequest: 'Send the back page too.' }),
      record('SELFIE_LIVENESS', { status: 'PENDING' }),
    ]);

    expect(progress.actionable).toBe(2);
    expect(progress.awaitingReview).toBe(1);
    expect(progress.verified).toBe(1);
  });

  it('rounds to whole percent', () => {
    const progress = journeyProgress([record('PHONE')]);

    // 1 of 6 self-serve steps.
    expect(progress.percent).toBe(17);
  });
});

describe('benefitUnlocks', () => {
  it('omits Tier 0, which is not a benefit', () => {
    expect(benefitUnlocks('TIER_0').map((unlock) => unlock.tier)).toEqual([
      'TIER_1',
      'TIER_2',
      'TIER_3',
    ]);
  });

  it('marks every tier up to and including the current one as unlocked', () => {
    expect(benefitUnlocks('TIER_2')).toEqual([
      { tier: 'TIER_1', unlocked: true },
      { tier: 'TIER_2', unlocked: true },
      { tier: 'TIER_3', unlocked: false },
    ]);
  });

  it('unlocks everything at the top tier', () => {
    expect(benefitUnlocks('TIER_3').every((unlock) => unlock.unlocked)).toBe(true);
  });
});

describe('newlyUnlocked', () => {
  it('reports only tiers that flipped, so nothing re-animates on every render', () => {
    expect(newlyUnlocked(benefitUnlocks('TIER_1'), benefitUnlocks('TIER_2'))).toEqual(['TIER_2']);
  });

  it('is empty when nothing changed', () => {
    expect(newlyUnlocked(benefitUnlocks('TIER_2'), benefitUnlocks('TIER_2'))).toEqual([]);
  });

  it('reports every tier crossed when several land at once', () => {
    expect(newlyUnlocked(benefitUnlocks('TIER_0'), benefitUnlocks('TIER_3'))).toEqual([
      'TIER_1',
      'TIER_2',
      'TIER_3',
    ]);
  });
});

describe('stage transitions', () => {
  it('mirrors the API rules', () => {
    expect(canTransition('SUBMITTED', 'UNDER_REVIEW')).toBe(true);
    expect(canTransition('SUBMITTED', 'APPROVED')).toBe(false);
    expect(canTransition('PENDING_APPROVAL', 'APPROVED')).toBe(true);
  });

  it('allows nothing out of a terminal stage', () => {
    expect(canTransition('APPROVED', 'UNDER_REVIEW')).toBe(false);
    expect(canTransition('REJECTED', 'SUBMITTED')).toBe(false);
    expect(isTerminalStage('APPROVED')).toBe(true);
    expect(isTerminalStage('UNDER_REVIEW')).toBe(false);
  });
});

describe('isSuspendingReason', () => {
  it('is true only for confirmed forgery (TRU-08)', () => {
    expect(isSuspendingReason('CONFIRMED_FRAUDULENT')).toBe(true);
    // Suspicion is not proof, and must not carry the suspension warning.
    expect(isSuspendingReason('SUSPECTED_FRAUD')).toBe(false);
    expect(isSuspendingReason('OCR_UNREADABLE')).toBe(false);
  });
});

describe('daysWaiting', () => {
  const now = new Date('2026-07-21T12:00:00.000Z');

  it('counts whole days since submission', () => {
    expect(daysWaiting('2026-07-18T12:00:00.000Z', now)).toBe(3);
    expect(daysWaiting('2026-07-21T09:00:00.000Z', now)).toBe(0);
  });

  it('never goes negative for a clock-skewed future timestamp', () => {
    expect(daysWaiting('2026-07-25T00:00:00.000Z', now)).toBe(0);
  });

  it('returns 0 for an unparseable timestamp instead of NaN', () => {
    expect(daysWaiting('not-a-date', now)).toBe(0);
  });
});
