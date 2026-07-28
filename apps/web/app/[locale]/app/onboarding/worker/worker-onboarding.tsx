'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { LocationFields } from '@/components/onboarding/location-fields';
import { MediaUpload } from '@/components/onboarding/media-upload';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { useOnboarding } from '@/components/onboarding/use-onboarding';
import { ONBOARDING_STEPS, readStep, resolveInitialStep } from '@/lib/onboarding';
import type {
  AvailabilitySlot,
  LocationValue,
  OnboardingState,
  PortfolioEntry,
  ServiceEntry,
} from '@/lib/onboarding';

const EMPTY_LOCATION: LocationValue = { city: '', source: 'HUMAN_INPUT' };

interface IdentityValue {
  idFrontAssetId?: string;
  idBackAssetId?: string;
  selfieAssetId?: string;
}

/**
 * Worker onboarding (ACC-10, TRU-05): services and starting prices,
 * availability, portfolio, ID + selfie, location — autosaved at every step and
 * resumable from wherever the user stopped.
 */
export function WorkerOnboarding({ initial }: { initial: OnboardingState }) {
  const t = useTranslations('Onboarding.worker');
  const tShared = useTranslations('Onboarding');
  const { state, status, error, save, complete } = useOnboarding('WORKER', initial);
  const [activeStep, setActiveStep] = useState(resolveInitialStep('WORKER', state.currentStep));
  const [completing, setCompleting] = useState(false);

  const services = readStep<ServiceEntry[]>(state.data, 'services', []);
  const availability = readStep<AvailabilitySlot[]>(state.data, 'availability', []);
  const portfolio = readStep<PortfolioEntry[]>(state.data, 'portfolio', []);
  const identity = readStep<IdentityValue>(state.data, 'identity', {});
  const location = readStep<LocationValue>(state.data, 'location', EMPTY_LOCATION);

  async function onComplete() {
    setCompleting(true);
    await complete();
    setCompleting(false);
  }

  return (
    <OnboardingShell
      title={t('title')}
      subtitle={t('subtitle')}
      namespace="Onboarding.worker"
      state={state}
      status={status}
      error={error}
      steps={ONBOARDING_STEPS.WORKER}
      activeStep={activeStep}
      onStepChange={setActiveStep}
      onComplete={() => void onComplete()}
      completing={completing}
    >
      {activeStep === 'services' && (
        <ServicesStep
          services={services}
          onChange={(next) => save('services', { services: next })}
        />
      )}

      {activeStep === 'availability' && (
        <AvailabilityStep
          slots={availability}
          onChange={(next) => save('availability', { availability: next })}
        />
      )}

      {activeStep === 'portfolio' && (
        <div className="flex flex-col gap-6">
          <MediaUpload
            kind="PORTFOLIO_IMAGE"
            label={t('steps.portfolio.upload')}
            hint={t('steps.portfolio.hint')}
            onUploaded={(result) =>
              save('portfolio', {
                portfolio: [
                  ...portfolio,
                  { mediaAssetId: result.id, type: 'PHOTO', previewUrl: result.url ?? undefined },
                ],
              })
            }
          />

          {portfolio.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {portfolio.map((item, index) => (
                <li
                  key={item.mediaAssetId}
                  className="relative overflow-hidden rounded-image border border-border bg-muted"
                >
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.previewUrl}
                      alt={item.caption ?? t('steps.portfolio.itemAlt', { index: index + 1 })}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                      {t('steps.portfolio.stored')}
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={tShared('remove')}
                    className="absolute right-1 top-1 bg-background/80"
                    onClick={() =>
                      save('portfolio', {
                        portfolio: portfolio.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 aria-hidden className="text-danger" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeStep === 'identity' && (
        <div className="flex flex-col gap-6">
          <p className="rounded-card bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
            {t('steps.identity.privacy')}
          </p>

          <MediaUpload
            kind="NATIONAL_ID_FRONT"
            label={t('steps.identity.idFront')}
            hint={identity.idFrontAssetId ? t('steps.identity.uploaded') : undefined}
            onUploaded={(result) =>
              save('identity', { identity: { ...identity, idFrontAssetId: result.id } })
            }
          />

          <MediaUpload
            kind="NATIONAL_ID_BACK"
            label={t('steps.identity.idBack')}
            hint={identity.idBackAssetId ? t('steps.identity.uploaded') : undefined}
            onUploaded={(result) =>
              save('identity', { identity: { ...identity, idBackAssetId: result.id } })
            }
          />

          <MediaUpload
            kind="SELFIE"
            capture="user"
            label={t('steps.identity.selfie')}
            hint={
              identity.selfieAssetId ? t('steps.identity.uploaded') : t('steps.identity.selfieHint')
            }
            onUploaded={(result) =>
              save('identity', { identity: { ...identity, selfieAssetId: result.id } })
            }
          />
        </div>
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

function ServicesStep({
  services,
  onChange,
}: {
  services: ServiceEntry[];
  onChange: (next: ServiceEntry[]) => void;
}) {
  const t = useTranslations('Onboarding.worker.steps.services');
  const tShared = useTranslations('Onboarding');

  function update(index: number, patch: Partial<ServiceEntry>) {
    onChange(services.map((service, i) => (i === index ? { ...service, ...patch } : service)));
  }

  return (
    <div className="flex flex-col gap-6">
      {services.map((service, index) => (
        <div key={index} className="flex flex-col gap-4 rounded-card border border-border p-4">
          <div className="flex items-start justify-between gap-2">
            <Field
              label={t('nameLabel')}
              value={service.name}
              placeholder={t('namePlaceholder')}
              className="flex-1"
              onChange={(event) => update(index, { name: event.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={tShared('remove')}
              className="mt-7"
              onClick={() => onChange(services.filter((_, i) => i !== index))}
            >
              <Trash2 aria-hidden className="text-danger" />
            </Button>
          </div>

          <Field
            label={t('priceLabel')}
            type="text"
            inputMode="numeric"
            value={service.startingPrice?.toString() ?? ''}
            // XAF has no minor unit, so only whole numbers are ever accepted.
            hint={t('priceHint')}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, '');
              update(index, { startingPrice: digits ? Number(digits) : undefined });
            }}
          />
        </div>
      ))}

      <Button type="button" variant="outline" onClick={() => onChange([...services, { name: '' }])}>
        <Plus aria-hidden />
        {t('add')}
      </Button>
    </div>
  );
}

function AvailabilityStep({
  slots,
  onChange,
}: {
  slots: AvailabilitySlot[];
  onChange: (next: AvailabilitySlot[]) => void;
}) {
  const t = useTranslations('Onboarding.worker.steps.availability');
  const tDays = useTranslations('Onboarding.days');

  // 0 = Sunday, matching Date.getDay() and the API's dayOfWeek.
  const days = [1, 2, 3, 4, 5, 6, 0];

  function toggle(day: number) {
    const existing = slots.find((slot) => slot.dayOfWeek === day);

    if (existing) {
      onChange(slots.filter((slot) => slot.dayOfWeek !== day));
      return;
    }

    onChange([...slots, { dayOfWeek: day, startTime: '08:00', endTime: '17:00' }]);
  }

  function update(day: number, patch: Partial<AvailabilitySlot>) {
    onChange(slots.map((slot) => (slot.dayOfWeek === day ? { ...slot, ...patch } : slot)));
  }

  return (
    <div className="flex flex-col gap-3">
      {days.map((day) => {
        const slot = slots.find((entry) => entry.dayOfWeek === day);

        return (
          <div
            key={day}
            className="flex flex-wrap items-center gap-3 rounded-card border border-border p-3"
          >
            <label className="flex flex-1 items-center gap-3">
              <input
                type="checkbox"
                checked={Boolean(slot)}
                onChange={() => toggle(day)}
                className="size-4 rounded border-input accent-[var(--color-primary)]"
              />
              <span className="text-sm font-medium text-foreground">{tDays(String(day))}</span>
            </label>

            {slot && (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={slot.startTime}
                  aria-label={t('startLabel')}
                  onChange={(event) => update(day, { startTime: event.target.value })}
                  className="rounded-input border border-input bg-surface px-3 py-2 text-sm"
                />
                <span aria-hidden className="text-muted-foreground">
                  –
                </span>
                <input
                  type="time"
                  value={slot.endTime}
                  aria-label={t('endLabel')}
                  onChange={(event) => update(day, { endTime: event.target.value })}
                  className="rounded-input border border-input bg-surface px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
