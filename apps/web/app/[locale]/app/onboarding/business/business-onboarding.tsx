'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { MediaUpload } from '@/components/onboarding/media-upload';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { useOnboarding } from '@/components/onboarding/use-onboarding';
import { ONBOARDING_STEPS, readStep, resolveInitialStep } from '@/lib/onboarding';
import type { OnboardingState, TeamMemberEntry } from '@/lib/onboarding';

interface CompanyValue {
  name?: string;
  description?: string;
  rccmNumber?: string;
  taxId?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
}

interface DocumentsValue {
  registrationAssetId?: string;
  logoAssetId?: string;
}

interface IdentityValue {
  idFrontAssetId?: string;
  idBackAssetId?: string;
  selfieAssetId?: string;
}

const TEAM_ROLES = ['ADMIN', 'HR_MANAGER', 'ACCOUNTANT', 'STAFF'] as const;
const ACCESS_LEVELS = ['FULL', 'MANAGE_JOBS', 'PAYMENTS', 'VIEW_ONLY'] as const;

/**
 * Business intake (ACC-10, BIZ-04). Captures company details, registration
 * documents and an initial team. Approval of the business — the Verified
 * Business badge — is a Trust/Admin decision in a later phase, so nothing here
 * grants it.
 */
export function BusinessOnboarding({ initial }: { initial: OnboardingState }) {
  const t = useTranslations('Onboarding.business');
  const tShared = useTranslations('Onboarding');
  const { state, status, error, save, complete } = useOnboarding('BUSINESS', initial);
  const [activeStep, setActiveStep] = useState(resolveInitialStep('BUSINESS', state.currentStep));
  const [completing, setCompleting] = useState(false);

  const company = readStep<CompanyValue>(state.data, 'company', {});
  const documents = readStep<DocumentsValue>(state.data, 'documents', {});
  const team = readStep<TeamMemberEntry[]>(state.data, 'team', []);
  const identity = readStep<IdentityValue>(state.data, 'identity', {});

  async function onComplete() {
    setCompleting(true);
    await complete();
    setCompleting(false);
  }

  function updateCompany(patch: Partial<CompanyValue>) {
    save('company', { company: { ...company, ...patch } });
  }

  return (
    <OnboardingShell
      title={t('title')}
      subtitle={t('subtitle')}
      namespace="Onboarding.business"
      state={state}
      status={status}
      error={error}
      steps={ONBOARDING_STEPS.BUSINESS}
      activeStep={activeStep}
      onStepChange={setActiveStep}
      onComplete={() => void onComplete()}
      completing={completing}
    >
      {activeStep === 'company' && (
        <div className="flex flex-col gap-6">
          <Field
            label={t('steps.company.nameLabel')}
            value={company.name ?? ''}
            placeholder={t('steps.company.namePlaceholder')}
            onChange={(event) => updateCompany({ name: event.target.value })}
          />

          <div className="flex flex-col gap-2">
            <label htmlFor="company-description" className="text-sm font-medium text-foreground">
              {t('steps.company.descriptionLabel')}
            </label>
            <textarea
              id="company-description"
              rows={4}
              value={company.description ?? ''}
              onChange={(event) => updateCompany({ description: event.target.value })}
              className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-surface-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <Field
            label={t('steps.company.rccmLabel')}
            value={company.rccmNumber ?? ''}
            hint={t('steps.company.rccmHint')}
            onChange={(event) => updateCompany({ rccmNumber: event.target.value })}
          />

          <Field
            label={t('steps.company.cityLabel')}
            value={company.city ?? ''}
            onChange={(event) => updateCompany({ city: event.target.value })}
          />

          <Field
            label={t('steps.company.addressLabel')}
            value={company.address ?? ''}
            onChange={(event) => updateCompany({ address: event.target.value })}
          />

          <Field
            label={t('steps.company.emailLabel')}
            type="email"
            inputMode="email"
            value={company.contactEmail ?? ''}
            onChange={(event) => updateCompany({ contactEmail: event.target.value })}
          />

          <Field
            label={t('steps.company.phoneLabel')}
            type="tel"
            inputMode="tel"
            placeholder="+237 6XX XX XX XX"
            value={company.contactPhone ?? ''}
            onChange={(event) => updateCompany({ contactPhone: event.target.value })}
          />
        </div>
      )}

      {activeStep === 'documents' && (
        <div className="flex flex-col gap-6">
          <p className="rounded-card bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
            {t('steps.documents.privacy')}
          </p>

          <MediaUpload
            kind="BUSINESS_REGISTRATION"
            label={t('steps.documents.registration')}
            hint={
              documents.registrationAssetId
                ? t('steps.documents.uploaded')
                : t('steps.documents.registrationHint')
            }
            onUploaded={(result) =>
              save('documents', { documents: { ...documents, registrationAssetId: result.id } })
            }
          />

          <MediaUpload
            kind="BUSINESS_LOGO"
            label={t('steps.documents.logo')}
            hint={documents.logoAssetId ? t('steps.documents.uploaded') : undefined}
            onUploaded={(result) =>
              save('documents', { documents: { ...documents, logoAssetId: result.id } })
            }
          />
        </div>
      )}

      {activeStep === 'team' && (
        <div className="flex flex-col gap-6">
          {team.map((member, index) => (
            <div key={index} className="flex flex-col gap-4 rounded-card border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <Field
                  label={t('steps.team.nameLabel')}
                  value={member.name}
                  className="flex-1"
                  onChange={(event) =>
                    save('team', {
                      team: team.map((entry, i) =>
                        i === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={tShared('remove')}
                  className="mt-7"
                  onClick={() => save('team', { team: team.filter((_, i) => i !== index) })}
                >
                  <Trash2 aria-hidden className="text-danger" />
                </Button>
              </div>

              <Field
                label={t('steps.team.emailLabel')}
                type="email"
                inputMode="email"
                value={member.email ?? ''}
                onChange={(event) =>
                  save('team', {
                    team: team.map((entry, i) =>
                      i === index ? { ...entry, email: event.target.value } : entry,
                    ),
                  })
                }
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium text-foreground">
                    {t('steps.team.roleLabel')}
                  </legend>
                  <div className="flex flex-col gap-1.5">
                    {TEAM_ROLES.map((role) => {
                      const selected = member.roles ?? ['STAFF'];
                      const checked = selected.includes(role);
                      return (
                        <label
                          key={role}
                          className="flex items-center gap-2.5 text-sm text-foreground"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...selected, role]
                                : selected.filter((entry) => entry !== role);
                              save('team', {
                                team: team.map((entry, i) =>
                                  i === index
                                    ? {
                                        ...entry,
                                        // At least one role always stays selected.
                                        roles: next.length > 0 ? next : selected,
                                      }
                                    : entry,
                                ),
                              });
                            }}
                            className="size-4 rounded border-input accent-[var(--color-primary)]"
                          />
                          {t(`steps.team.roles.${role}`)}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
                  {t('steps.team.accessLabel')}
                  <select
                    value={member.accessLevel ?? 'VIEW_ONLY'}
                    onChange={(event) =>
                      save('team', {
                        team: team.map((entry, i) =>
                          i === index
                            ? {
                                ...entry,
                                accessLevel: event.target.value as TeamMemberEntry['accessLevel'],
                              }
                            : entry,
                        ),
                      })
                    }
                    className="rounded-input border border-input bg-surface px-4 py-2.5 text-sm font-normal text-surface-foreground"
                  >
                    {ACCESS_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {t(`steps.team.accessLevels.${level}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              save('team', {
                team: [...team, { name: '', roles: ['STAFF'], accessLevel: 'VIEW_ONLY' }],
              })
            }
          >
            <Plus aria-hidden />
            {t('steps.team.add')}
          </Button>
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
    </OnboardingShell>
  );
}
