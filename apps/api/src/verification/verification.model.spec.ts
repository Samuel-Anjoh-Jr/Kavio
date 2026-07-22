import {
  TrustEventType,
  VerificationCheckType,
  VerificationRejectionReason,
  VerificationStage,
} from '@trustpro/database';
import {
  approvalRate,
  averageReviewMinutes,
  canTransition,
  CHECK_DEFINITIONS,
  checkTypesForGroup,
  isTerminalStage,
  QUEUE_GROUP_CHECK_TYPES,
  rejectionMessageKey,
  REJECTION_POLICIES,
  STAGE_TRANSITIONS,
} from './verification.model';

describe('check definitions (TRU-06)', () => {
  it('covers every check type, so a new check cannot ship unconfigured', () => {
    for (const checkType of Object.values(VerificationCheckType)) {
      expect(CHECK_DEFINITIONS[checkType]).toBeDefined();
    }
  });

  it('settles ID_SUBMITTED without review and ID_APPROVED with it (SRS §21.4)', () => {
    // The tier table gates Tier 1 on "ID uploaded" and Tier 2 on "ID approved".
    // Those are different claims: one is a fact, one is a judgement.
    expect(CHECK_DEFINITIONS[VerificationCheckType.ID_SUBMITTED].requiresReview).toBe(false);
    expect(CHECK_DEFINITIONS[VerificationCheckType.ID_APPROVED].requiresReview).toBe(true);
  });

  it('settles ID_SUBMITTED as a side effect of asking for approval', () => {
    expect(CHECK_DEFINITIONS[VerificationCheckType.ID_APPROVED].alsoVerifies).toContain(
      VerificationCheckType.ID_SUBMITTED,
    );
  });

  it('pays trust points only for the SRS §21.5 signals', () => {
    const scoring = Object.entries(CHECK_DEFINITIONS)
      .filter(([, definition]) => definition.trustEvent !== null)
      .map(([, definition]) => definition.trustEvent);

    // Submitting a document, proving an address or passing liveness gate a tier
    // but score nothing — the point table pays for the approval, once.
    expect(new Set(scoring)).toEqual(
      new Set([
        TrustEventType.PHONE_VERIFIED,
        TrustEventType.ID_VERIFIED,
        TrustEventType.PORTFOLIO_ADDED,
        TrustEventType.FIELD_VERIFIED,
      ]),
    );
  });

  it('requires both sides of a national ID before a reviewer sees it', () => {
    expect(CHECK_DEFINITIONS[VerificationCheckType.ID_APPROVED].minDocuments).toBe(2);
  });

  it('marks field verification staff-only (AGT-01)', () => {
    expect(CHECK_DEFINITIONS[VerificationCheckType.FIELD_VERIFICATION].staffOnly).toBe(true);
    // Nothing a user submits about themselves may claim an in-person visit.
    const selfServe = Object.entries(CHECK_DEFINITIONS)
      .filter(([, definition]) => !definition.staffOnly)
      .map(([checkType]) => checkType);
    expect(selfServe).not.toContain(VerificationCheckType.FIELD_VERIFICATION);
  });
});

describe('rejection policy (TRU-07, TRU-08)', () => {
  it('covers every reason', () => {
    for (const reason of Object.values(VerificationRejectionReason)) {
      expect(REJECTION_POLICIES[reason]).toBeDefined();
    }
  });

  it('lets the subject retry everything except confirmed forgery', () => {
    for (const reason of Object.values(VerificationRejectionReason)) {
      expect(REJECTION_POLICIES[reason].retryable).toBe(
        reason !== VerificationRejectionReason.CONFIRMED_FRAUDULENT,
      );
    }
  });

  it('suspends for confirmed fraudulent documents only (TRU-08)', () => {
    const suspending = Object.values(VerificationRejectionReason).filter(
      (reason) => REJECTION_POLICIES[reason].suspends,
    );

    expect(suspending).toEqual([VerificationRejectionReason.CONFIRMED_FRAUDULENT]);
  });

  it('does not suspend on mere suspicion — being wrong costs someone their living', () => {
    const suspected = REJECTION_POLICIES[VerificationRejectionReason.SUSPECTED_FRAUD];

    expect(suspected.suspends).toBe(false);
    expect(suspected.escalates).toBe(true);
    expect(suspected.retryable).toBe(true);
  });

  it('returns an i18n key rather than English copy', () => {
    expect(rejectionMessageKey(VerificationRejectionReason.OCR_UNREADABLE)).toBe(
      'Verification.rejection.OCR_UNREADABLE',
    );
  });
});

describe('stage machine (AGT-03)', () => {
  it('walks the SRS pipeline end to end', () => {
    expect(canTransition(VerificationStage.SUBMITTED, VerificationStage.UNDER_REVIEW)).toBe(true);
    expect(canTransition(VerificationStage.UNDER_REVIEW, VerificationStage.FIELD_CHECK)).toBe(true);
    expect(canTransition(VerificationStage.FIELD_CHECK, VerificationStage.PENDING_APPROVAL)).toBe(
      true,
    );
    expect(canTransition(VerificationStage.PENDING_APPROVAL, VerificationStage.APPROVED)).toBe(
      true,
    );
  });

  it('refuses to skip straight from submission to approval', () => {
    expect(canTransition(VerificationStage.SUBMITTED, VerificationStage.APPROVED)).toBe(false);
  });

  it('allows "request more info" to send an item back to SUBMITTED', () => {
    expect(canTransition(VerificationStage.UNDER_REVIEW, VerificationStage.SUBMITTED)).toBe(true);
    expect(canTransition(VerificationStage.PENDING_APPROVAL, VerificationStage.SUBMITTED)).toBe(
      true,
    );
  });

  it('can reject from any live stage', () => {
    for (const stage of [
      VerificationStage.SUBMITTED,
      VerificationStage.UNDER_REVIEW,
      VerificationStage.FIELD_CHECK,
      VerificationStage.PENDING_APPROVAL,
    ]) {
      expect(canTransition(stage, VerificationStage.REJECTED)).toBe(true);
    }
  });

  it('treats decided items as terminal — a new attempt is a new record', () => {
    expect(isTerminalStage(VerificationStage.APPROVED)).toBe(true);
    expect(isTerminalStage(VerificationStage.REJECTED)).toBe(true);
    expect(STAGE_TRANSITIONS[VerificationStage.APPROVED]).toEqual([]);
    expect(STAGE_TRANSITIONS[VerificationStage.REJECTED]).toEqual([]);
  });

  it('has no transition out of a stage it does not define', () => {
    for (const stage of Object.values(VerificationStage)) {
      expect(STAGE_TRANSITIONS[stage]).toBeDefined();
    }
  });
});

describe('pipeline metrics (AGT-03)', () => {
  const submittedAt = new Date('2026-07-20T08:00:00.000Z');

  it('averages only decided submissions', () => {
    const average = averageReviewMinutes([
      { submittedAt, reviewedAt: new Date('2026-07-20T09:00:00.000Z') },
      { submittedAt, reviewedAt: new Date('2026-07-20T10:00:00.000Z') },
      // Still queued — including it would make the metric improve whenever a
      // submission is abandoned.
      { submittedAt, reviewedAt: null },
    ]);

    expect(average).toBe(90);
  });

  it('returns null when nothing has been decided yet', () => {
    expect(averageReviewMinutes([{ submittedAt, reviewedAt: null }])).toBeNull();
    expect(averageReviewMinutes([])).toBeNull();
  });

  it('ignores negative durations from clock skew or backfills', () => {
    const average = averageReviewMinutes([
      { submittedAt, reviewedAt: new Date('2026-07-20T07:00:00.000Z') },
      { submittedAt, reviewedAt: new Date('2026-07-20T09:00:00.000Z') },
    ]);

    expect(average).toBe(60);
  });

  it('reports approval rate as a fraction', () => {
    expect(approvalRate(3, 1)).toBe(0.75);
  });

  it('distinguishes "approved nothing" from "reviewed nothing"', () => {
    expect(approvalRate(0, 0)).toBeNull();
    expect(approvalRate(0, 5)).toBe(0);
  });
});

describe('queue tabs (ADM-03)', () => {
  it('applies no check-type filter for the ALL tab', () => {
    expect(checkTypesForGroup('ALL')).toBeNull();
  });

  it('groups every ID-related check under the ID tab', () => {
    const idTypes = checkTypesForGroup('ID');
    expect(idTypes).toContain(VerificationCheckType.ID_SUBMITTED);
    expect(idTypes).toContain(VerificationCheckType.ID_APPROVED);
    expect(idTypes).toContain(VerificationCheckType.SELFIE_LIVENESS);
  });

  it('scopes the Business and Field tabs to their single check type', () => {
    expect(checkTypesForGroup('BUSINESS')).toEqual([VerificationCheckType.BUSINESS_REGISTRATION]);
    expect(checkTypesForGroup('FIELD')).toEqual([VerificationCheckType.FIELD_VERIFICATION]);
  });

  it('places every reviewed check type under exactly one tab', () => {
    // A check that belongs to no tab is invisible in the grouped queue, and one
    // in two tabs is double-counted — both are queue bugs a new check type could
    // introduce silently, so the partition is asserted whole.
    const grouped = Object.values(QUEUE_GROUP_CHECK_TYPES).flat();
    const seen = new Set(grouped);
    expect(seen.size).toBe(grouped.length);
    // PHONE and PORTFOLIO settle instantly and never reach the reviewer queue,
    // so they are intentionally outside the tabs.
    const queued = Object.values(VerificationCheckType).filter(
      (type) => type !== VerificationCheckType.PHONE && type !== VerificationCheckType.PORTFOLIO,
    );
    for (const type of queued) {
      expect(seen.has(type)).toBe(true);
    }
  });
});
