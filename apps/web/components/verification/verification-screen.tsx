'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { ApiError } from '@/lib/api-error';
import { requestFieldVisit } from '@/lib/verification-api';
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
  // FIELD_VERIFICATION has no page of its own: the worker can only ASK for a
  // visit (handleStart below calls the API directly), never open a flow that
  // completes it — an agent still settles the check in person (AGT-01).
};

export function VerificationScreen({
  records,
  tier,
}: {
  records: VerificationRecord[];
  tier: Tier;
}) {
  const router = useRouter();
  const t = useTranslations('VerificationScreen');
  const [busyCheckType, setBusyCheckType] = useState<VerificationCheckType | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleStart(step: JourneyStep) {
    if (step.checkType === 'FIELD_VERIFICATION') {
      setBusyCheckType('FIELD_VERIFICATION');
      setActionError(null);
      try {
        await requestFieldVisit();
        // Re-fetches loadVerification() server-side so the row flips to PENDING.
        router.refresh();
      } catch (error) {
        const code = error instanceof ApiError ? error.code : 'UNKNOWN_ERROR';
        const key = t.has(`fieldVisitError.${code}`)
          ? `fieldVisitError.${code}`
          : 'fieldVisitError.UNKNOWN_ERROR';
        setActionError(t(key));
      } finally {
        setBusyCheckType(null);
      }
      return;
    }

    const destination = STEP_DESTINATION[step.checkType];
    if (destination) router.push(destination);
  }

  return (
    <VerificationJourney
      records={records}
      tier={tier}
      onStart={(step) => void handleStart(step)}
      busyCheckType={busyCheckType}
      actionError={actionError}
    />
  );
}
