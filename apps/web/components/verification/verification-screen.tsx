'use client';

import { useRouter } from '@/i18n/navigation';
import { VerificationJourney } from './verification-journey';
import type {
  JourneyStep,
  Tier,
  VerificationCheckType,
  VerificationRecord,
} from '@/lib/verification';

/**
 * Routes each journey step to the flow that actually collects its evidence.
 *
 * Uploading is NOT reimplemented here — the worker onboarding flow already owns
 * document capture, and a second upload surface would mean two places to keep
 * the file validation and the friendly-retry copy in sync. This screen owns
 * PROGRESS (TRU-05); onboarding owns collection.
 *
 * Onboarding has no per-step deep link yet, so document checks land on the flow
 * and it resumes at the worker's current step.
 */
const STEP_DESTINATION: Partial<Record<VerificationCheckType, string>> = {
  PHONE: '/auth/verify',
  ID_SUBMITTED: '/app/onboarding/worker',
  ID_APPROVED: '/app/onboarding/worker',
  SELFIE_LIVENESS: '/app/onboarding/worker',
  ADDRESS: '/app/onboarding/worker',
  PORTFOLIO: '/app/onboarding/worker',
  BUSINESS_REGISTRATION: '/app/onboarding/business',
  // FIELD_VERIFICATION is staff-only (AGT-01): an agent creates it in person,
  // so there is nothing for the worker to open.
};

export function VerificationScreen({
  records,
  tier,
}: {
  records: VerificationRecord[];
  tier: Tier;
}) {
  const router = useRouter();

  function handleStart(step: JourneyStep) {
    const destination = STEP_DESTINATION[step.checkType];
    if (destination) router.push(destination);
  }

  return <VerificationJourney records={records} tier={tier} onStart={handleStart} />;
}
