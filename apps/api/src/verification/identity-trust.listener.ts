import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TrustEventType, VerificationCheckType } from '@trustpro/database';
import {
  IDENTITY_CREATED,
  IDENTITY_PHONE_VERIFIED,
  IdentityCreatedEvent,
  IdentityPhoneVerifiedEvent,
} from '../auth/auth.events';
import { createLogger } from '../lib/logger';
import { TrustScoreService } from '../trust/trust-score.service';
import { VerificationService } from './verification.service';

const logger = createLogger('verification:identity');

/**
 * Turns identity events into trust ledger entries (TRU-06, SRS §21.5).
 *
 * This listener is the seam that keeps AuthModule free of any dependency on the
 * Trust Engine. Auth says "an identity exists" and "a phone was proved"; what
 * those facts are worth is decided here and priced by the point model — so
 * changing the starting score never means editing sign-up.
 *
 * Both handlers are idempotent, because event delivery in a system that will
 * eventually retry must be assumed to happen more than once.
 */
@Injectable()
export class IdentityTrustListener {
  constructor(
    private readonly trust: TrustScoreService,
    private readonly verification: VerificationService,
  ) {}

  /** Grants the SRS §21.5 baseline (+15) exactly once per identity. */
  @OnEvent(IDENTITY_CREATED)
  async onIdentityCreated(event: IdentityCreatedEvent): Promise<void> {
    try {
      await this.trust.record({
        subjectId: event.userId,
        type: TrustEventType.ACCOUNT_CREATED,
        actorId: null,
        sourceType: 'SignUp',
      });
    } catch (error) {
      // A failure here must not fail the sign-up that already succeeded — the
      // account exists, and the ledger can be re-derived by a recompute. Losing
      // a starting score is recoverable; losing a registration is not.
      logger.error('Could not record the starting trust score', {
        payload: { userId: event.userId },
        error,
      });
    }
  }

  /**
   * Settles the PHONE check (TRU-06) and records the +10 (§21.5).
   *
   * `recordAutomaticCheck` returns early when the check is already VERIFIED, so
   * a re-verified phone number cannot be paid for twice.
   */
  @OnEvent(IDENTITY_PHONE_VERIFIED)
  async onPhoneVerified(event: IdentityPhoneVerifiedEvent): Promise<void> {
    try {
      await this.verification.recordAutomaticCheck(event.userId, VerificationCheckType.PHONE, {
        actorId: null,
        metadata: { source: 'OTP' },
      });
    } catch (error) {
      logger.error('Could not settle the phone verification check', {
        payload: { userId: event.userId },
        error,
      });
    }
  }
}
