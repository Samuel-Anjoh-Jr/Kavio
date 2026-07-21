import {
  MediaAssetKind,
  TrustEventType,
  VerificationCheckType,
  VerificationRejectionReason,
  VerificationStage,
} from '@trustpro/database';

/**
 * The verification rules (TRU-06, TRU-07, TRU-08, AGT-03), as PURE data and
 * pure functions.
 *
 * Everything that decides an outcome lives here rather than in a service: which
 * documents a check needs, which checks a submission settles by itself, what a
 * passed check is worth in the trust ledger, which stage moves are legal, and
 * which rejections end an account. Each of those is a product decision someone
 * will want to re-read later, and none of them is improved by being spread
 * across three transaction bodies.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Checks
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckDefinition {
  /**
   * False for checks that are self-evident from the submission itself. Uploading
   * an ID is a FACT — a reviewer adds nothing by confirming that a file arrived —
   * whereas whether the ID is genuine is a judgement, and that is a separate
   * check. This distinction is why SRS §21.4 gates Tier 1 on "ID submitted" and
   * Tier 2 on "ID approved": they are different claims with different evidence.
   */
  readonly requiresReview: boolean;
  /** Document kinds this check is decided on. Empty for evidence-free checks. */
  readonly documentKinds: readonly MediaAssetKind[];
  /** Fewest documents a submission must carry. */
  readonly minDocuments: number;
  /**
   * Checks this submission settles immediately, without review. Submitting an ID
   * proves ID_SUBMITTED on the spot while ID_APPROVED waits for a human.
   */
  readonly alsoVerifies: readonly VerificationCheckType[];
  /**
   * What passing is worth in the trust ledger (SRS §21.5). Null for checks that
   * gate a tier without scoring — the tier IS the reward, and paying twice for
   * one action would quietly double the SRS point table.
   */
  readonly trustEvent: TrustEventType | null;
  /** True for checks only staff may create (field visits, founding intake). */
  readonly staffOnly: boolean;
}

export const CHECK_DEFINITIONS: Readonly<Record<VerificationCheckType, CheckDefinition>> = {
  [VerificationCheckType.PHONE]: {
    // Settled by the OTP flow itself; no reviewer ever sees one.
    requiresReview: false,
    documentKinds: [],
    minDocuments: 0,
    alsoVerifies: [],
    trustEvent: TrustEventType.PHONE_VERIFIED,
    staffOnly: false,
  },
  [VerificationCheckType.ID_SUBMITTED]: {
    requiresReview: false,
    documentKinds: [MediaAssetKind.NATIONAL_ID_FRONT, MediaAssetKind.NATIONAL_ID_BACK],
    minDocuments: 1,
    alsoVerifies: [],
    // Uploading is not an achievement; approval is. Tier 1 is the reward here.
    trustEvent: null,
    staffOnly: false,
  },
  [VerificationCheckType.ID_APPROVED]: {
    requiresReview: true,
    documentKinds: [MediaAssetKind.NATIONAL_ID_FRONT, MediaAssetKind.NATIONAL_ID_BACK],
    // Both sides: a Cameroonian national ID carries the holder's details on the
    // front and the issuing data on the back, and one without the other cannot
    // be checked properly.
    minDocuments: 2,
    alsoVerifies: [VerificationCheckType.ID_SUBMITTED],
    trustEvent: TrustEventType.ID_VERIFIED,
    staffOnly: false,
  },
  [VerificationCheckType.SELFIE_LIVENESS]: {
    requiresReview: true,
    documentKinds: [MediaAssetKind.SELFIE],
    minDocuments: 1,
    alsoVerifies: [],
    trustEvent: null,
    staffOnly: false,
  },
  [VerificationCheckType.ADDRESS]: {
    requiresReview: true,
    documentKinds: [MediaAssetKind.PROOF_OF_ADDRESS],
    minDocuments: 1,
    alsoVerifies: [],
    trustEvent: null,
    staffOnly: false,
  },
  [VerificationCheckType.PORTFOLIO]: {
    // Self-evident like ID_SUBMITTED: the photos either exist or they do not.
    // Whether the work is good is what reviews are for, not a verification check.
    requiresReview: false,
    documentKinds: [MediaAssetKind.PORTFOLIO_IMAGE],
    minDocuments: 1,
    alsoVerifies: [],
    trustEvent: TrustEventType.PORTFOLIO_ADDED,
    staffOnly: false,
  },
  [VerificationCheckType.FIELD_VERIFICATION]: {
    requiresReview: true,
    documentKinds: [MediaAssetKind.SELFIE, MediaAssetKind.CERTIFICATE],
    minDocuments: 0,
    alsoVerifies: [],
    trustEvent: TrustEventType.FIELD_VERIFIED,
    // Only an agent standing in front of the person can assert this (AGT-01).
    staffOnly: true,
  },
  [VerificationCheckType.BUSINESS_REGISTRATION]: {
    requiresReview: true,
    documentKinds: [MediaAssetKind.BUSINESS_REGISTRATION],
    minDocuments: 1,
    alsoVerifies: [],
    trustEvent: null,
    staffOnly: false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Rejection reasons
// ─────────────────────────────────────────────────────────────────────────────

export interface RejectionPolicy {
  /**
   * May the subject try again? True for everything except confirmed forgery —
   * a blurry photo is a retry, not a verdict, and TRU-07 is explicit that the
   * tone stays non-judgemental.
   */
  readonly retryable: boolean;
  /**
   * Confirmed fraudulent documents trigger permanent suspension, overriding the
   * accumulated Trust Score entirely (TRU-08, SRS §21.5 last row).
   */
  readonly suspends: boolean;
  /** True when the reason warrants a fraud review even without suspension. */
  readonly escalates: boolean;
}

export const REJECTION_POLICIES: Readonly<Record<VerificationRejectionReason, RejectionPolicy>> = {
  [VerificationRejectionReason.OCR_UNREADABLE]: {
    retryable: true,
    suspends: false,
    escalates: false,
  },
  [VerificationRejectionReason.DOCUMENT_EXPIRED]: {
    retryable: true,
    suspends: false,
    escalates: false,
  },
  [VerificationRejectionReason.DETAILS_MISMATCH]: {
    retryable: true,
    suspends: false,
    escalates: false,
  },
  [VerificationRejectionReason.INCOMPLETE_SUBMISSION]: {
    retryable: true,
    suspends: false,
    escalates: false,
  },
  [VerificationRejectionReason.WRONG_DOCUMENT_TYPE]: {
    retryable: true,
    suspends: false,
    escalates: false,
  },
  [VerificationRejectionReason.FIELD_CHECK_FAILED]: {
    retryable: true,
    suspends: false,
    escalates: false,
  },
  [VerificationRejectionReason.SUSPECTED_FRAUD]: {
    // Suspicion is not proof. The attempt is refused and a human investigates;
    // the account survives, because being wrong here costs someone their living.
    retryable: true,
    suspends: false,
    escalates: true,
  },
  [VerificationRejectionReason.CONFIRMED_FRAUDULENT]: {
    retryable: false,
    suspends: true,
    escalates: true,
  },
  [VerificationRejectionReason.OTHER]: {
    retryable: true,
    suspends: false,
    escalates: false,
  },
};

/**
 * i18n key for the friendly retry line (TRU-07).
 *
 * The API returns a KEY, never a sentence: the copy is EN/FR in the web
 * catalogue, and "We couldn't read your ID clearly. Try again in better
 * lighting" only reads that way in English if English is where it lives.
 */
export function rejectionMessageKey(reason: VerificationRejectionReason): string {
  return `Verification.rejection.${reason}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The review pipeline (AGT-03)
// ─────────────────────────────────────────────────────────────────────────────

/** The board's columns, in the order SRS AGT-03 lists them. */
export const PIPELINE_STAGES: readonly VerificationStage[] = [
  VerificationStage.SUBMITTED,
  VerificationStage.UNDER_REVIEW,
  VerificationStage.FIELD_CHECK,
  VerificationStage.PENDING_APPROVAL,
  VerificationStage.APPROVED,
];

/** Stages an item can no longer be moved out of. */
export const TERMINAL_STAGES: readonly VerificationStage[] = [
  VerificationStage.APPROVED,
  VerificationStage.REJECTED,
];

/**
 * Legal moves.
 *
 * Explicitly a graph rather than "any stage to any stage", because the metrics
 * in AGT-03 (average review time, approval rate) are only meaningful if items
 * actually walk the pipeline. Backward moves exist where the work genuinely goes
 * backward: asking for more information returns an item to SUBMITTED, and a
 * field check that raises a question returns it to UNDER_REVIEW.
 */
export const STAGE_TRANSITIONS: Readonly<Record<VerificationStage, readonly VerificationStage[]>> =
  {
    [VerificationStage.SUBMITTED]: [VerificationStage.UNDER_REVIEW, VerificationStage.REJECTED],
    [VerificationStage.UNDER_REVIEW]: [
      VerificationStage.FIELD_CHECK,
      VerificationStage.PENDING_APPROVAL,
      VerificationStage.SUBMITTED,
      VerificationStage.REJECTED,
    ],
    [VerificationStage.FIELD_CHECK]: [
      VerificationStage.PENDING_APPROVAL,
      VerificationStage.UNDER_REVIEW,
      VerificationStage.REJECTED,
    ],
    [VerificationStage.PENDING_APPROVAL]: [
      VerificationStage.APPROVED,
      VerificationStage.UNDER_REVIEW,
      VerificationStage.SUBMITTED,
      VerificationStage.REJECTED,
    ],
    [VerificationStage.APPROVED]: [],
    [VerificationStage.REJECTED]: [],
  };

export function canTransition(from: VerificationStage, to: VerificationStage): boolean {
  return STAGE_TRANSITIONS[from].includes(to);
}

export function isTerminalStage(stage: VerificationStage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline metrics (AGT-03)
// ─────────────────────────────────────────────────────────────────────────────

export interface StageTransitionSample {
  readonly toStage: VerificationStage;
  readonly createdAt: Date;
}

/**
 * Average minutes from a submission entering the pipeline to reaching a decision.
 *
 * Counts DECIDED items only. Including items still in the queue would report a
 * number that improves every time a submission is abandoned, which is exactly
 * backwards from what an operations metric is for.
 */
export function averageReviewMinutes(
  decided: readonly { submittedAt: Date; reviewedAt: Date | null }[],
): number | null {
  const durations = decided
    .filter((item): item is { submittedAt: Date; reviewedAt: Date } => item.reviewedAt !== null)
    .map((item) => (item.reviewedAt.getTime() - item.submittedAt.getTime()) / 60_000)
    // A clock skew or a backfilled row must not drag the average negative.
    .filter((minutes) => minutes >= 0);

  if (durations.length === 0) {
    return null;
  }

  return (
    Math.round((durations.reduce((sum, minutes) => sum + minutes, 0) / durations.length) * 10) / 10
  );
}

/**
 * Share of decided submissions that were approved, 0–1.
 *
 * Null rather than 0 when nothing has been decided: "we approve 0%" and "we have
 * not reviewed anything yet" are different facts, and a dashboard that renders
 * the second as the first will start a conversation nobody needs to have.
 */
export function approvalRate(approved: number, rejected: number): number | null {
  const decided = approved + rejected;
  if (decided === 0) {
    return null;
  }
  return Math.round((approved / decided) * 1000) / 1000;
}
