'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/auth/field';
import { LocationFields } from '@/components/onboarding/location-fields';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { useOnboarding } from '@/components/onboarding/use-onboarding';
import { ONBOARDING_STEPS, readStep, resolveInitialStep } from '@/lib/onboarding';
import type { LocationValue, OnboardingState } from '@/lib/onboarding';

const EMPTY_LOCATION: LocationValue = { city: '', source: 'HUMAN_INPUT' };

/**
 * Client onboarding (ACC-10). Deliberately two steps: someone who wants to hire
 * a plumber should not face a worker-sized intake, and the same
 * completion-percentage framing still applies.
 */
export function ClientOnboarding({ initial }: { initial: OnboardingState }) {
  const t = useTranslations('Onboarding.client');
  const { state, status, error, save, complete } = useOnboarding('CLIENT', initial);
  const [activeStep, setActiveStep] = useState(resolveInitialStep('CLIENT', state.currentStep));
  const [completing, setCompleting] = useState(false);

  const profile = readStep<{ displayName?: string }>(state.data, 'profile', {});
  const location = readStep<LocationValue>(state.data, 'location', EMPTY_LOCATION);

  // The account already has a name from sign-up. Asking again with no memory
  // of it reads as a broken flow, so an untouched profile step opens with it
  // pre-filled — through the normal `save`, so it is a real answer (backing
  // "Finish setup") rather than a value the screen merely displays. Still
  // fully editable: any further edit here is a plain autosave like any other.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (!initial.suggestedDisplayName) return;
    save('profile', { profile: { displayName: initial.suggestedDisplayName } });
    // Runs once against the name the page loaded with — not meant to re-fire
    // as `save`/`initial` identities change on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onComplete() {
    setCompleting(true);
    await complete();
    setCompleting(false);
  }

  return (
    <OnboardingShell
      title={t('title')}
      subtitle={t('subtitle')}
      namespace="Onboarding.client"
      state={state}
      status={status}
      error={error}
      steps={ONBOARDING_STEPS.CLIENT}
      activeStep={activeStep}
      onStepChange={setActiveStep}
      onComplete={() => void onComplete()}
      completing={completing}
    >
      {activeStep === 'profile' && (
        <Field
          label={t('steps.profile.nameLabel')}
          value={profile.displayName ?? ''}
          placeholder={t('steps.profile.namePlaceholder')}
          hint={t('steps.profile.nameHint')}
          onChange={(event) =>
            save('profile', { profile: { ...profile, displayName: event.target.value } })
          }
        />
      )}

      {activeStep === 'location' && (
        <LocationFields
          value={location}
          onChange={(next) => save('location', { location: next })}
        />
      )}
    </OnboardingShell>
  );
}
