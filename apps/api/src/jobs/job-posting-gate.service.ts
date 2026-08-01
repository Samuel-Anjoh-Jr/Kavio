import { HttpStatus, Injectable } from '@nestjs/common';
import { JobVisibility, Role, VerificationCheckType, VerificationStatus } from '@kavio/database';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';

const logger = createLogger('jobs.posting-gate');

/** i18n key prefix for the unlock-step copy. The web catalogue owns EN/FR. */
const REQUIREMENT_KEY_PREFIX = 'Jobs.postingRequirement';

/** One concrete thing an unverified poster must do before the board opens. */
export interface PostingUnlockStep {
  readonly kind: 'CHECK' | 'BUSINESS_PROFILE';
  readonly checkType?: VerificationCheckType;
  /** Stable key for the localized instruction line. */
  readonly messageKey: string;
}

export interface PostingEligibility {
  readonly allowed: boolean;
  /** True once the identity owns a staff-approved business. */
  readonly businessVerified: boolean;
  /** Flat charge to publish, in whole XAF. 0 means free, and is shown as free. */
  readonly feeXaf: number;
  /** Empty when allowed; the exact missing steps otherwise (JOB-01 anti-lure). */
  readonly steps: readonly PostingUnlockStep[];
}

/**
 * The gate on PUBLIC job listings (JOB-01), the marketplace's anti-lure control.
 *
 * ── What is gated, and what deliberately is not ─────────────────────────────
 *
 * Only publishing to the public job BOARD is gated. A client with no
 * verification at all still creates jobs, invites a worker they picked, receives
 * quotes, pays into escrow and reviews — that is a DIRECT engagement, and it
 * carries no lure risk because the client chose the counterparty rather than
 * broadcasting to strangers.
 *
 * A PUBLIC listing is the opposite shape: one post, many strangers answering it.
 * That is precisely the surface a fake-job lure abuses ("urgent, pay double",
 * harvesting contacts), so it requires a business whose registration document
 * and owner's ID a human has approved. A company letterhead is not identity,
 * which is why BOTH checks are required and neither substitutes for the other.
 *
 * ── Why business verification rather than a Tier ────────────────────────────
 *
 * This used to demand Tier 2 of any poster. But a tier is a property of a
 * PERSON, and what the board needs to know is that a BUSINESS exists and is
 * registered — the RCCM is the fact that makes a vacancy credible. The
 * BusinessProfile.verified flag is set only by the registration-approval
 * listener, never by an owner edit, so it cannot be self-granted.
 *
 * When the gate refuses, it returns the EXACT remaining steps as codes the web
 * layer renders in EN/FR, so the wall doubles as the on-ramp.
 */
@Injectable()
export class JobPostingGateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /** Computes eligibility without throwing — the read behind the "can I post?" UI. */
  async check(userId: string): Promise<PostingEligibility> {
    const [business, idApproved, feeXaf] = await Promise.all([
      this.prisma.client.businessProfile.findUnique({
        where: { ownerId: userId },
        select: { verified: true },
      }),
      this.prisma.client.verificationRecord.findFirst({
        where: {
          subjectId: userId,
          checkType: VerificationCheckType.ID_APPROVED,
          status: VerificationStatus.VERIFIED,
        },
        select: { id: true },
      }),
      this.settings.jobPostingFeeXaf(),
    ]);

    const businessVerified = business?.verified === true;
    const steps: PostingUnlockStep[] = [];

    // Order matters: this list is rendered as a checklist top to bottom, and
    // identity comes before the company because a registration document is
    // reviewed against the person presenting it.
    if (!idApproved) {
      steps.push({
        kind: 'CHECK',
        checkType: VerificationCheckType.ID_APPROVED,
        messageKey: `${REQUIREMENT_KEY_PREFIX}.ID_APPROVED`,
      });
    }

    if (!business) {
      steps.push({
        kind: 'BUSINESS_PROFILE',
        messageKey: `${REQUIREMENT_KEY_PREFIX}.BUSINESS_PROFILE`,
      });
    } else if (!businessVerified) {
      steps.push({
        kind: 'CHECK',
        checkType: VerificationCheckType.BUSINESS_REGISTRATION,
        messageKey: `${REQUIREMENT_KEY_PREFIX}.BUSINESS_REGISTRATION`,
      });
    }

    return {
      allowed: businessVerified && Boolean(idApproved),
      businessVerified,
      feeXaf,
      steps,
    };
  }

  /**
   * Asserts the caller may publish at this visibility, or throws a 403 whose
   * body carries the unlock steps. A guided detour, not a dead end (JOB-01).
   *
   * A DIRECT publish is always allowed: it is how an unverified client hires.
   */
  async assertCanPublish(userId: string, visibility: JobVisibility): Promise<PostingEligibility> {
    const eligibility = await this.check(userId);

    if (visibility === JobVisibility.DIRECT || eligibility.allowed) {
      return eligibility;
    }

    logger.info('Public job listing blocked — business not verified', {
      payload: {
        userId,
        businessVerified: eligibility.businessVerified,
        missing: eligibility.steps.map((step) => step.checkType ?? step.kind),
      },
    });

    throw new AppException(
      HttpStatus.FORBIDDEN,
      'BUSINESS_VERIFICATION_REQUIRED',
      'Get verified as a business to post job vacancies. This keeps fake jobs off Kavio.',
      {
        // The client renders these as a checklist; the codes key the EN/FR copy.
        verification: eligibility.steps.map((step) => step.messageKey),
      },
    );
  }

  /**
   * Asserts a CLIENT-role DIRECT publish names the one worker it is for
   * (JOB-01 anti-lure, defense in depth). The UI never reaches a workerless
   * publish for a client — Request a Quote always sends `workerId` — so this
   * only ever fires against a direct API call. BUSINESS callers are exempt:
   * their own recruiting flow is gated on the PUBLIC side above, and a
   * business inviting a worker directly is not the broadcast shape this closes.
   */
  assertDirectHasWorker(role: Role, workerId: string | undefined): void {
    if (role !== Role.CLIENT || workerId) {
      return;
    }

    logger.info('Direct job publish blocked — no worker named', { payload: { role } });
    throw new AppException(
      HttpStatus.FORBIDDEN,
      'WORKER_REQUIRED',
      'Find a worker and request a quote from their profile. Kavio does not let clients broadcast open jobs.',
    );
  }
}
