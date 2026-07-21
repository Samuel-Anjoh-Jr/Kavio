'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check, CloudOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormBanner } from '@/components/auth/form-banner';
import { CompletionMeter } from './completion-meter';
import { Confetti } from './confetti';
import type { SaveStatus } from './use-onboarding';
import type { OnboardingState } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

/**
 * Shared frame for all three onboarding flows (ACC-10).
 *
 * Two columns on desktop — steps left, live completion meter right — and a
 * single column on phone with the meter first, so the reason to keep going is
 * the first thing seen rather than something below the fold.
 */
export function OnboardingShell({
  title,
  subtitle,
  namespace,
  state,
  status,
  error,
  steps,
  activeStep,
  onStepChange,
  onComplete,
  completing,
  children,
}: {
  title: string;
  subtitle: string;
  namespace: string;
  state: OnboardingState;
  status: SaveStatus;
  error: Error | null;
  steps: string[];
  activeStep: string;
  onStepChange: (step: string) => void;
  onComplete: () => void;
  completing: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('Onboarding');
  const tRole = useTranslations(namespace);

  const done = Boolean(state.completedAt);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Confetti active={done} />

      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="max-w-2xl text-muted-foreground">{subtitle}</p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="order-2 lg:order-1">
          <nav aria-label={t('stepsLabel')} className="mb-6 flex flex-wrap gap-2">
            {steps.map((step, index) => {
              const complete = state.completedSteps.includes(step);
              const active = step === activeStep;

              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => onStepChange(step)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-button border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-input bg-surface text-muted-foreground hover:bg-muted',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full text-xs',
                      complete ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {complete ? <Check className="size-3" /> : index + 1}
                  </span>
                  {tRole(`steps.${step}.label`)}
                </button>
              );
            })}
          </nav>

          {error && <div className="mb-6"><FormBanner tone="error" message={t('saveFailed')} /></div>}
          {done && (
            <div className="mb-6">
              <FormBanner tone="success" message={tRole('completed')} />
            </div>
          )}

          <div className="rounded-card border border-border bg-surface p-6">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {tRole(`steps.${activeStep}.title`)}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tRole(`steps.${activeStep}.description`)}
            </p>
            <div className="mt-6">{children}</div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <SaveIndicator status={status} />
            <Button
              type="button"
              size="lg"
              onClick={onComplete}
              disabled={completing || done}
              // Completion is server-validated too; disabling here is a hint,
              // not the gate.
            >
              {completing ? <Loader2 aria-hidden className="animate-spin" /> : null}
              {done ? t('finished') : t('finish')}
            </Button>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <CompletionMeter
            percent={state.completionPercent}
            unlocks={state.unlocks}
            namespace={namespace}
          />
        </div>
      </div>
    </div>
  );
}

/** Autosave feedback — silence here would read as lost work. */
function SaveIndicator({ status }: { status: SaveStatus }) {
  const t = useTranslations('Onboarding');

  if (status === 'idle') return null;

  const map = {
    saving: { icon: <Loader2 aria-hidden className="size-3.5 animate-spin" />, text: t('saving'), tone: 'text-muted-foreground' },
    saved: { icon: <Check aria-hidden className="size-3.5" />, text: t('saved'), tone: 'text-success' },
    error: { icon: <CloudOff aria-hidden className="size-3.5" />, text: t('saveFailedShort'), tone: 'text-danger' },
  } as const;

  const entry = map[status];

  return (
    <p role="status" aria-live="polite" className={cn('flex items-center gap-2 text-xs', entry.tone)}>
      {entry.icon}
      {entry.text}
    </p>
  );
}
