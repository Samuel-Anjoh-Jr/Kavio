/**
 * Client-side verification contract and progress rules (TRU-05, TRU-06, TRU-07).
 *
 * Mirrors apps/api/src/verification/models/verification.model.ts and the
 * CHECK_DEFINITIONS table in apps/api/src/verification/verification.model.ts.
 *
 * TRU-05 is the requirement this file serves: verification must read as PROGRESS
 * with unlockable benefits, not as a checklist of obligations. The difference is
 * mostly arithmetic and ordering — what counts towards the percentage, what a
 * worker can actually act on, and what they get for it — so that reasoning lives
 * here rather than being improvised inside a component.
 */

export type VerificationCheckType =
  | 'PHONE'
  | 'ID_SUBMITTED'
  | 'ID_APPROVED'
  | 'SELFIE_LIVENESS'
  | 'ADDRESS'
  | 'PORTFOLIO'
  | 'FIELD_VERIFICATION'
  | 'BUSINESS_REGISTRATION';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export type VerificationStage =
  'SUBMITTED' | 'UNDER_REVIEW' | 'FIELD_CHECK' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export type VerificationRejectionReason =
  | 'OCR_UNREADABLE'
  | 'DOCUMENT_EXPIRED'
  | 'DETAILS_MISMATCH'
  | 'INCOMPLETE_SUBMISSION'
  | 'WRONG_DOCUMENT_TYPE'
  | 'FIELD_CHECK_FAILED'
  | 'SUSPECTED_FRAUD'
  | 'CONFIRMED_FRAUDULENT'
  | 'OTHER';

export interface VerificationRecord {
  id: string;
  checkType: VerificationCheckType;
  status: VerificationStatus;
  stage: VerificationStage;
  attempt: number;
  rejectionReason: VerificationRejectionReason | null;
  /** i18n key for the friendly retry line (TRU-07). */
  rejectionKey: string | null;
  /** False only for confirmed forgery — everything else can be sent again. */
  retryable: boolean;
  infoRequest: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

/** Board columns, in the order an item travels (AGT-03). */
export const PIPELINE_STAGES: readonly VerificationStage[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'FIELD_CHECK',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
];

/** Mirrors STAGE_TRANSITIONS in the API. The server re-checks; this only hides
 *  moves that would be refused, so a reviewer is never offered a dead button. */
export const STAGE_TRANSITIONS: Readonly<Record<VerificationStage, readonly VerificationStage[]>> =
  {
    SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
    UNDER_REVIEW: ['FIELD_CHECK', 'PENDING_APPROVAL', 'SUBMITTED', 'REJECTED'],
    FIELD_CHECK: ['PENDING_APPROVAL', 'UNDER_REVIEW', 'REJECTED'],
    PENDING_APPROVAL: ['APPROVED', 'UNDER_REVIEW', 'SUBMITTED', 'REJECTED'],
    APPROVED: [],
    REJECTED: [],
  };

export function canTransition(from: VerificationStage, to: VerificationStage): boolean {
  return STAGE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalStage(stage: VerificationStage): boolean {
  return stage === 'APPROVED' || stage === 'REJECTED';
}

/** Rejection reasons a reviewer may pick, worst last so it is never the default. */
export const REJECTION_REASONS: readonly VerificationRejectionReason[] = [
  'OCR_UNREADABLE',
  'DOCUMENT_EXPIRED',
  'DETAILS_MISMATCH',
  'INCOMPLETE_SUBMISSION',
  'WRONG_DOCUMENT_TYPE',
  'FIELD_CHECK_FAILED',
  'OTHER',
  'SUSPECTED_FRAUD',
  'CONFIRMED_FRAUDULENT',
];

/** Rejections that permanently suspend the identity (TRU-08). */
export function isSuspendingReason(reason: VerificationRejectionReason): boolean {
  return reason === 'CONFIRMED_FRAUDULENT';
}

export interface JourneyStep {
  readonly checkType: VerificationCheckType;
  /**
   * False for checks only staff can create (field visits). They still SHOW —
   * hiding the road to Tier 3 would make it look unreachable — but they are
   * excluded from the percentage, because a worker cannot be held at 80%
   * by something they are not allowed to do.
   */
  readonly selfServe: boolean;
  /** True when the check settles on submission, with no reviewer involved. */
  readonly instant: boolean;
  /**
   * True for a staff-only check the subject can still ASK for (a field visit),
   * as distinct from `selfServe` (completing the check themselves). Requesting
   * only queues it for an agent to complete, so it stays out of the percentage
   * the same way `selfServe: false` already does.
   */
  readonly requestable?: boolean;
}

/**
 * The worker journey, in the order it is presented.
 *
 * ID_SUBMITTED and ID_APPROVED are kept as two steps even though one upload
 * starts both. SRS §21.4 gates Tier 1 on the upload and Tier 2 on the approval,
 * so collapsing them into one row would misreport where the worker actually
 * stands the moment they submit.
 */
export const WORKER_JOURNEY: readonly JourneyStep[] = [
  { checkType: 'PHONE', selfServe: true, instant: true },
  { checkType: 'ID_SUBMITTED', selfServe: true, instant: true },
  { checkType: 'ID_APPROVED', selfServe: true, instant: false },
  { checkType: 'SELFIE_LIVENESS', selfServe: true, instant: false },
  { checkType: 'ADDRESS', selfServe: true, instant: false },
  { checkType: 'PORTFOLIO', selfServe: true, instant: true },
  { checkType: 'FIELD_VERIFICATION', selfServe: false, instant: false, requestable: true },
];

export const BUSINESS_JOURNEY: readonly JourneyStep[] = [
  ...WORKER_JOURNEY,
  { checkType: 'BUSINESS_REGISTRATION', selfServe: true, instant: false },
];

/**
 * The live state of one check: the NEWEST attempt wins.
 *
 * Attempts accumulate as separate rows so a rejection can be re-submitted
 * (TRU-06), which means "is my ID approved?" is answered by the latest row and
 * never by whether any row is VERIFIED — a worker whose first attempt passed and
 * whose later re-submission was rejected is currently rejected.
 */
export function latestAttempt(
  records: readonly VerificationRecord[],
  checkType: VerificationCheckType,
): VerificationRecord | null {
  const matching = records.filter((record) => record.checkType === checkType);
  if (matching.length === 0) return null;

  return matching.reduce((newest, record) => (record.attempt > newest.attempt ? record : newest));
}

export type StepState = 'VERIFIED' | 'PENDING' | 'REJECTED' | 'INFO_REQUESTED' | 'NOT_STARTED';

export function stepState(record: VerificationRecord | null): StepState {
  if (!record) return 'NOT_STARTED';
  if (record.status === 'VERIFIED') return 'VERIFIED';
  if (record.status === 'REJECTED') return 'REJECTED';
  // An outstanding question is not the same as "we are working on it": the ball
  // is in the worker's court, and the UI has to say so or they will just wait.
  if (record.infoRequest) return 'INFO_REQUESTED';
  return 'PENDING';
}

export interface JourneyProgress {
  /** 0–100, over SELF-SERVE steps only. */
  percent: number;
  verified: number;
  /** How many self-serve steps count towards the percentage. */
  total: number;
  /** Steps needing the worker to do something now (rejected or info requested). */
  actionable: number;
  /** Steps waiting on a reviewer. */
  awaitingReview: number;
}

export function journeyProgress(
  records: readonly VerificationRecord[],
  journey: readonly JourneyStep[] = WORKER_JOURNEY,
): JourneyProgress {
  const selfServe = journey.filter((step) => step.selfServe);

  let verified = 0;
  let actionable = 0;
  let awaitingReview = 0;

  for (const step of journey) {
    const state = stepState(latestAttempt(records, step.checkType));

    if (state === 'VERIFIED' && step.selfServe) verified += 1;
    if (state === 'REJECTED' || state === 'INFO_REQUESTED') actionable += 1;
    if (state === 'PENDING') awaitingReview += 1;
  }

  const total = selfServe.length;

  return {
    percent: total === 0 ? 0 : Math.round((verified / total) * 100),
    verified,
    total,
    actionable,
    awaitingReview,
  };
}

export type Tier = 'TIER_0' | 'TIER_1' | 'TIER_2' | 'TIER_3';

const TIER_SEQUENCE: readonly Tier[] = ['TIER_0', 'TIER_1', 'TIER_2', 'TIER_3'];

export interface BenefitUnlock {
  /** The tier whose benefits these are; also the i18n key under Trust.unlock.*. */
  tier: Tier;
  unlocked: boolean;
}

/**
 * Benefits framed as unlocks (TRU-05).
 *
 * Tier 0 is deliberately absent: "you have an account" is not a benefit, and
 * listing it as one to pad the board would be the checklist feeling this
 * requirement exists to avoid.
 */
export function benefitUnlocks(currentTier: Tier): BenefitUnlock[] {
  const currentIndex = TIER_SEQUENCE.indexOf(currentTier);

  return TIER_SEQUENCE.slice(1).map((tier) => ({
    tier,
    unlocked: currentIndex >= TIER_SEQUENCE.indexOf(tier),
  }));
}

/** Unlocks that are newly true since the last render — the ones worth animating. */
export function newlyUnlocked(
  previous: readonly BenefitUnlock[],
  next: readonly BenefitUnlock[],
): Tier[] {
  const was = new Set(previous.filter((unlock) => unlock.unlocked).map((unlock) => unlock.tier));

  return next.filter((unlock) => unlock.unlocked && !was.has(unlock.tier)).map((u) => u.tier);
}

/**
 * How stale a queue item is, in whole days. Drives the "waiting too long" flag
 * on the review board — a submission nobody has touched is the failure mode a
 * verification queue actually has.
 */
export function daysWaiting(submittedAt: string, now: Date = new Date()): number {
  const submitted = new Date(submittedAt).getTime();
  if (Number.isNaN(submitted)) return 0;

  return Math.max(0, Math.floor((now.getTime() - submitted) / 86_400_000));
}

/** Items older than this are surfaced as overdue on the board. */
export const STALE_AFTER_DAYS = 3;
