import { HttpStatus, Injectable } from '@nestjs/common';
import { VerificationTier } from '@trustpro/database';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { evaluateGate, type UnmetRequirement } from '../trust/tier.model';
import { TierService, tierRank } from '../trust/tier.service';

const logger = createLogger('jobs.posting-gate');

/** The tier a poster must have reached to publish a job (JOB-01). */
export const MIN_POSTING_TIER: VerificationTier = VerificationTier.TIER_2;

/** i18n key prefix for the unlock-step copy. The web catalogue owns EN/FR. */
const REQUIREMENT_KEY_PREFIX = 'Jobs.postingRequirement';

/** One concrete thing a sub-Tier-2 poster must do before they can post. */
export interface PostingUnlockStep {
  readonly kind: UnmetRequirement['kind'];
  readonly checkType?: UnmetRequirement['checkType'];
  /** Stable key for the localized instruction line. */
  readonly messageKey: string;
  readonly required: number | string;
  readonly current: number | string;
}

export interface PostingEligibility {
  readonly allowed: boolean;
  readonly currentTier: VerificationTier;
  readonly requiredTier: VerificationTier;
  /** Empty when allowed; the exact missing steps otherwise (JOB-01 anti-lure). */
  readonly steps: readonly PostingUnlockStep[];
}

/**
 * The Tier 2+ posting gate (JOB-01), the marketplace's central anti-lure control.
 *
 * Fake-job lures are the classic attack on a services marketplace: a throwaway
 * account posts "urgent, will pay double" to harvest contacts or worse. Requiring
 * an APPROVED government ID (Tier 2) before a job can go live raises the cost of
 * that from free to "submit your real identity to human review", which is the
 * whole point — and it applies identically to an individual Client and a Business
 * owner, because a company letterhead is not identity.
 *
 * The tier is DERIVED FRESH here, never read from the JWT claim. A token minted
 * before an ID was approved still says Tier 1, and a token minted before an ID
 * was found fraudulent still says Tier 2 — posting is exactly the decision where
 * a stale claim is worth a database read to get right.
 *
 * When the gate refuses, it does not just say no: it returns the EXACT remaining
 * steps (JOB-01 "shown exactly which verification steps unlock posting"), as
 * codes the web layer renders in EN/FR, so the wall doubles as the on-ramp.
 */
@Injectable()
export class JobPostingGateService {
  constructor(private readonly tiers: TierService) {}

  /** Computes eligibility without throwing — the read behind the "can I post?" UI. */
  async check(userId: string): Promise<PostingEligibility> {
    const [input, gates] = await Promise.all([
      this.tiers.derivationInputFor(userId),
      this.tiers.getGates(),
    ]);

    const derived = await this.tiers.deriveFor(userId);
    const allowed = tierRank(derived.tier) >= tierRank(MIN_POSTING_TIER);

    if (allowed) {
      return {
        allowed: true,
        currentTier: derived.tier,
        requiredTier: MIN_POSTING_TIER,
        steps: [],
      };
    }

    // Evaluate the Tier 2 gate itself — NOT deriveFor's `unmet`, which only
    // covers the very next rung. A Tier 0 user needs the Tier 1 AND Tier 2
    // requirements laid out, so the steps come from the target gate directly.
    const targetGate = gates.find((gate) => gate.tier === MIN_POSTING_TIER);
    const unmet = targetGate ? evaluateGate(targetGate, input) : [];

    return {
      allowed: false,
      currentTier: derived.tier,
      requiredTier: MIN_POSTING_TIER,
      steps: unmet.map(toStep),
    };
  }

  /**
   * Asserts the caller may post, or throws a 403 whose body carries the unlock
   * steps. A guided detour, not a dead end (JOB-01).
   */
  async assertCanPost(userId: string): Promise<void> {
    const eligibility = await this.check(userId);

    if (eligibility.allowed) {
      return;
    }

    logger.info('Job posting blocked below Tier 2', {
      payload: {
        userId,
        currentTier: eligibility.currentTier,
        missing: eligibility.steps.map((step) => step.checkType ?? step.kind),
      },
    });

    throw new AppException(
      HttpStatus.FORBIDDEN,
      'POSTING_TIER_REQUIRED',
      'Verify your identity to post a job. This keeps fake jobs off TrustPro.',
      {
        // The client renders these as a checklist; the codes key the EN/FR copy.
        verification: eligibility.steps.map((step) => step.messageKey),
      },
    );
  }
}

function toStep(unmet: UnmetRequirement): PostingUnlockStep {
  const suffix = unmet.kind === 'CHECK' ? (unmet.checkType ?? 'CHECK') : unmet.kind;
  return {
    kind: unmet.kind,
    checkType: unmet.checkType,
    messageKey: `${REQUIREMENT_KEY_PREFIX}.${suffix}`,
    required: unmet.required,
    current: unmet.current,
  };
}
