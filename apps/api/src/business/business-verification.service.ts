import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { BadgeType, VerificationCheckType, VerificationTier } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger, getRequestId } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { BadgeService } from '../trust/badges/badge.service';
import {
  VERIFICATION_APPROVED,
  VerificationApprovedEvent,
} from '../verification/verification.events';
import { VerificationService } from '../verification/verification.service';
import { BusinessAccessService } from './business-access.service';
import { BUSINESS_VERIFIED, BusinessVerifiedEvent } from './business.events';

const logger = createLogger('business:verification');

/**
 * Enhanced Business Verification (BIZ-01).
 *
 * The RCCM submission rides the SAME verification pipeline as every other check
 * — VerificationCheckType.BUSINESS_REGISTRATION, reviewed by staff on the ADM-03
 * queue — rather than growing a private approval flow. That is what puts company
 * papers in the queue admins already work, with the same audit trail, the same
 * coded rejection reasons and the same friendly retry.
 *
 * What this service adds is the CONSEQUENCE: on approval the company is marked
 * verified, the owner earns the Verified Business badge, and corporate
 * eligibility becomes computable. It listens for the approval rather than being
 * called by the reviewer, so the verification module stays unaware that
 * businesses exist.
 */
@Injectable()
export class BusinessVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly verification: VerificationService,
    private readonly badges: BadgeService,
    private readonly access: BusinessAccessService,
  ) {}

  /**
   * Submits the company's registration papers for review (BIZ-01).
   *
   * Refuses without an RCCM number on the profile: the reviewer's job is to check
   * that the documents match the registration the company claims, and a
   * submission with nothing to match against wastes a review cycle and comes back
   * rejected for a reason the owner could have been told instantly.
   */
  async submitRegistration(
    user: AuthenticatedUser,
    businessProfileId: string,
    documentIds: string[],
  ) {
    await this.access.require(user, businessProfileId, 'business:profile');

    const business = await this.prisma.client.businessProfile.findUnique({
      where: { id: businessProfileId },
      select: { id: true, ownerId: true, rccmNumber: true, verified: true },
    });

    if (!business) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'BUSINESS_NOT_FOUND',
        'We could not find that business.',
      );
    }

    if (business.verified) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ALREADY_VERIFIED',
        'This business is already verified.',
      );
    }

    if (!business.rccmNumber) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'RCCM_REQUIRED',
        'Add your RCCM registration number before sending your documents.',
      );
    }

    // The check belongs to the OWNER identity, like every other verification:
    // tier and verification attach to the identity, never to a role or a profile
    // row (ACC-06). The business is 1:1 with its owner, so nothing is lost.
    const result = await this.verification.submit(
      user,
      VerificationCheckType.BUSINESS_REGISTRATION,
      documentIds,
    );

    logger.info('Business registration submitted for review', {
      result: { businessProfileId, recordId: result.recordId },
    });

    return result;
  }

  /**
   * Marks the company verified once staff approve its registration (BIZ-01).
   *
   * Idempotent: a replayed event finds the profile already verified and returns
   * without re-awarding or re-announcing anything.
   */
  @OnEvent(VERIFICATION_APPROVED)
  async onVerificationApproved(event: VerificationApprovedEvent): Promise<void> {
    if (event.checkType !== VerificationCheckType.BUSINESS_REGISTRATION) {
      return;
    }

    const business = await this.prisma.client.businessProfile.findUnique({
      where: { ownerId: event.subjectId },
      select: { id: true, ownerId: true, verified: true },
    });

    if (!business) {
      // An identity approved for BUSINESS_REGISTRATION with no business profile
      // is a real inconsistency worth seeing, not something to swallow.
      logger.warn('Business registration approved for an identity with no business profile', {
        payload: { subjectId: event.subjectId, recordId: event.recordId },
      });
      return;
    }

    if (business.verified) {
      return;
    }

    await this.prisma.client.businessProfile.update({
      where: { id: business.id },
      data: {
        verified: true,
        verifiedAt: new Date(),
        verifiedById: event.reviewerId,
      },
    });

    // Awarded directly rather than through the badge rule table: `earnedBadges`
    // evaluates identity-level trust state, and "this company's papers are in
    // order" is a fact about a business profile that no trust event carries.
    await this.badges.award(business.ownerId, BadgeType.VERIFIED_BUSINESS, {
      sourceType: 'BusinessProfile',
      sourceId: business.id,
    });

    await this.prisma.client.auditLog.create({
      data: {
        actorId: event.reviewerId,
        action: 'business.verified',
        target: `BusinessProfile:${business.id}`,
        requestId: event.requestId ?? getRequestId(),
        meta: { ownerId: business.ownerId, recordId: event.recordId },
      },
    });

    this.events.emit(
      BUSINESS_VERIFIED,
      new BusinessVerifiedEvent({
        businessProfileId: business.id,
        ownerId: business.ownerId,
        reviewerId: event.reviewerId,
        requestId: event.requestId,
      }),
    );

    logger.info('Business verified', {
      result: { businessProfileId: business.id, ownerId: business.ownerId },
    });
  }

  /**
   * Whether the company may take Tier-3-gated corporate engagements (BIZ-01).
   *
   * TWO conditions, and both are load-bearing:
   *
   *   - the COMPANY's registration is approved (the papers are real), and
   *   - the OWNER's identity is at Tier 3 (a person has been field-verified and
   *     has delivered work).
   *
   * A registration certificate alone proves a company was filed, which is cheap
   * in any jurisdiction. Corporate work is the highest-value, highest-trust tier
   * the platform sells, so it requires the paperwork AND the human record behind
   * it — and because tier attaches to the identity rather than the role (ACC-06),
   * the owner's Tier 3 is exactly the right thing to read.
   */
  async corporateEligibility(businessProfileId: string) {
    const business = await this.prisma.client.businessProfile.findUnique({
      where: { id: businessProfileId },
      select: {
        id: true,
        verified: true,
        verifiedAt: true,
        owner: { select: { id: true, tier: true } },
      },
    });

    if (!business) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'BUSINESS_NOT_FOUND',
        'We could not find that business.',
      );
    }

    const ownerAtTier3 = business.owner.tier === VerificationTier.TIER_3;

    return {
      businessProfileId: business.id,
      verifiedBusiness: business.verified,
      verifiedAt: business.verifiedAt,
      ownerTier: business.owner.tier,
      eligible: business.verified && ownerAtTier3,
      // Coded, not prose: the EN/FR copy lives in the web catalogue.
      unmet: [
        ...(business.verified ? [] : ['BUSINESS_REGISTRATION_NOT_APPROVED']),
        ...(ownerAtTier3 ? [] : ['OWNER_NOT_TIER_3']),
      ],
    };
  }
}
