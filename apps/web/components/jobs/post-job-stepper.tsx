'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ChevronLeft, ChevronRight, Loader2, ShieldCheck, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useIntentReplay, useRequireAuth } from '@/components/auth/require-auth';
import { LocationSetter } from '@/components/discovery/location-setter';
import { useBrowsingLocation } from '@/components/discovery/location-provider';
import { AssetUploader } from '@/components/uploads/asset-uploader';
import { RemoteImage } from '@/components/ui/remote-image';
import { ApiError } from '@/lib/api-error';
import { formatXaf } from '@/lib/discovery';
import type { GatedIntent } from '@/lib/intent';
import {
  clearJobDraft,
  EMPTY_JOB_DRAFT,
  JOB_URGENCIES,
  parseBudget,
  readJobDraft,
  readJobDraftServer,
  subscribeJobDraft,
  writeJobDraft,
  type JobDraft,
  type JobUrgency,
} from '@/lib/jobs';
import {
  SERVICE_CATEGORIES_QUERY,
  type ServiceCategoriesQueryResult,
} from '@/lib/graphql/discovery';
import {
  JOB_POSTING_ELIGIBILITY_QUERY,
  type JobPostingEligibilityResult,
} from '@/lib/graphql/jobs';
import { restPatch, restPost, type UploadResult } from '@/lib/rest-api';
import { cn } from '@/lib/utils';

/**
 * The multi-step post-job stepper (JOB-02): Details → Location → Budget → Review.
 *
 * ── Autosave, always ─────────────────────────────────────────────────────────
 * Every edit is mirrored to localStorage immediately, so a dropped 3G connection
 * or a bounce to auth never costs the user their typing. A guest who taps "Post"
 * is sent to login with the whole draft carried IN the captured intent (ACC-02),
 * and `useIntentReplay` drops them back here with it — the point is to resume the
 * decision, not merely the URL.
 *
 * ── Two gates, surfaced honestly ─────────────────────────────────────────────
 * Anyone may create and publish a DIRECT job — that is how a client hires the
 * worker they already chose. Putting a vacancy on the PUBLIC board is the gated
 * act (JOB-01), and only a verified business may do it. Eligibility is read up
 * front so the choice and its fee are offered rather than discovered: the 403
 * still carries the exact remaining steps, and this screen renders them as a
 * checklist with a route to verification rather than a dead wall.
 */

const STEPS = ['details', 'location', 'budget', 'review'] as const;
type StepKey = (typeof STEPS)[number];

type PostState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'posted'; jobId: string }
  | { kind: 'gated'; message: string; requestId: string }
  | { kind: 'error'; message: string; requestId?: string };

interface UploadedPhoto {
  id: string;
  url: string | null;
}

export function PostJobStepper() {
  const t = useTranslations('PostJob');
  const tLocation = useTranslations('Location');
  // Read up front, not on refusal: the fee and the remaining steps belong in
  // front of the poster while they still have a choice to make.
  const { data: eligibilityData } = useQuery<JobPostingEligibilityResult>(
    JOB_POSTING_ELIGIBILITY_QUERY,
    { fetchPolicy: 'cache-and-network' },
  );
  const eligibility = eligibilityData?.jobPostingEligibility;
  const canPostPublicly = eligibility?.allowed === true;
  const locale = useLocale();
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const { location } = useBrowsingLocation();

  // The draft is the external store (localStorage). Reading it through
  // useSyncExternalStore rather than an effect gets hydration and cross-tab sync
  // right and keeps the component free of set-state-in-effect. The server
  // snapshot is null, so the first paint shows the empty draft either way.
  const storedDraft = useSyncExternalStore(subscribeJobDraft, readJobDraft, readJobDraftServer);
  const draft = storedDraft ?? EMPTY_JOB_DRAFT;

  const [step, setStep] = useState<StepKey>('details');
  // URLs for photos uploaded THIS session — the draft only persists asset ids,
  // so a resumed draft shows its photos as "attached" without a preview.
  const [sessionPhotos, setSessionPhotos] = useState<UploadedPhoto[]>([]);
  const [resumed, setResumed] = useState(false);
  const [post, setPost] = useState<PostState>({ kind: 'idle' });

  const { data: categoryData } = useQuery<ServiceCategoriesQueryResult>(SERVICE_CATEGORIES_QUERY, {
    variables: { topLevelOnly: false },
  });
  const categories = categoryData?.serviceCategories ?? [];

  const photos: UploadedPhoto[] = draft.photoAssetIds.map(
    (id) => sessionPhotos.find((p) => p.id === id) ?? { id, url: null },
  );
  const publishPublicly = draft.publishPublicly;

  // One writer for the draft: merge and persist to the store, which notifies the
  // useSyncExternalStore subscription so the UI re-renders from one value.
  const update = useCallback(
    (patch: Partial<JobDraft>) => {
      writeJobDraft({ ...draft, ...patch });
    },
    [draft],
  );

  // Resume the draft carried through an auth bounce, if one is waiting for us.
  const restore = useCallback((intent: GatedIntent) => {
    const payload = intent.payload as Partial<JobDraft> | undefined;
    if (!payload) return;
    writeJobDraft({ ...EMPTY_JOB_DRAFT, ...payload });
    setResumed(true);
    setStep('review');
  }, []);
  useIntentReplay('post_job', restore);

  // The chosen browsing location leads (CLAUDE.md: "the set location drives feed
  // and search"). It is read live from the location store rather than mirrored
  // into the draft, so there is one source of truth and no synchronising effect
  // to get wrong; the draft's own `location` (carried through an auth bounce) is
  // the fallback when the store has since been cleared.
  const jobLocation = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        source: location.source,
        landmark: location.landmark ?? null,
        label: location.label ?? null,
      }
    : draft.location;

  function onPhotoUploaded(result: UploadResult) {
    setSessionPhotos((current) => [...current, { id: result.id, url: result.url }]);
    update({ photoAssetIds: [...draft.photoAssetIds, result.id] });
  }

  function removePhoto(id: string) {
    setSessionPhotos((current) => current.filter((p) => p.id !== id));
    update({ photoAssetIds: draft.photoAssetIds.filter((pid) => pid !== id) });
  }

  const stepIndex = STEPS.indexOf(step);
  const titleValid = draft.title.trim().length > 0;
  const budgetMin = parseBudget(draft.budgetMin);
  const budgetMax = parseBudget(draft.budgetMax);
  const budgetOrderValid = budgetMin == null || budgetMax == null || budgetMax >= budgetMin;

  const canAdvance = useMemo(() => {
    if (step === 'details') return titleValid;
    if (step === 'budget') return budgetOrderValid;
    return true;
  }, [step, titleValid, budgetOrderValid]);

  function goNext() {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  }
  function goBack() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  }

  /** Builds the createJobSchema body from the current draft. */
  function toCreateBody() {
    return {
      title: draft.title.trim() || undefined,
      description: draft.description.trim() || undefined,
      categoryId: draft.categoryId ?? undefined,
      budgetMin: budgetMin ?? undefined,
      budgetMax: budgetMax ?? undefined,
      urgency: draft.urgency,
      location: jobLocation
        ? {
            latitude: jobLocation.latitude,
            longitude: jobLocation.longitude,
            source: jobLocation.source,
            landmark: jobLocation.landmark,
          }
        : undefined,
      photoAssetIds: draft.photoAssetIds.length > 0 ? draft.photoAssetIds : undefined,
    };
  }

  async function submit() {
    setPost({ kind: 'idle' });

    // Guests: capture the whole draft and bounce; useIntentReplay resumes it.
    const proceeded = requireAuth('post_job', undefined, {
      payload: { ...draft },
      returnTo: '/app/jobs/new',
    });
    if (!proceeded) return;

    setPost({ kind: 'working' });
    try {
      // Create the DRAFT row (or update it if we already have one), then publish.
      let jobId = draft.jobId;
      if (jobId) {
        await restPatch(`jobs/${jobId}`, toCreateBody());
      } else {
        const created = await restPost<{ id: string }>('jobs', toCreateBody());
        jobId = created.id;
        update({ jobId });
      }

      await restPost(`jobs/${jobId}/publish`, {
        // DIRECT unless a verified business explicitly chose the open board.
        visibility: canPostPublicly && publishPublicly ? 'PUBLIC' : 'DIRECT',
      });
      clearJobDraft();
      setPost({ kind: 'posted', jobId });
      router.push(`/app/jobs/${jobId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        // The Tier 2+ anti-lure gate answers 403 with the steps to unlock (JOB-01).
        if (err.status === 403) {
          setPost({ kind: 'gated', message: err.message, requestId: err.requestId });
          return;
        }
        setPost({ kind: 'error', message: err.message, requestId: err.requestId });
        return;
      }
      setPost({ kind: 'error', message: t('postFailed') });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <StepProgress current={stepIndex} labels={STEPS.map((s) => t(`steps.${s}`))} />

      {resumed && <FormBanner tone="success" message={t('resumed')} />}

      {step === 'details' && (
        <section className="flex flex-col gap-6" aria-labelledby="step-details">
          <h2 id="step-details" className="sr-only">
            {t('steps.details')}
          </h2>

          {/* Asked before the title, not at review: which board this lands on
              changes what a good title even looks like ("Fix a leaking tap"
              vs "Waitress needed"), so the choice has to come first. Only a
              verified business ever sees this — everyone else can only ever
              invite the one worker they already chose (JOB-01's anti-lure
              gate), and this toggle simply does not render for them. */}
          {canPostPublicly && (
            <div className="rounded-card border border-border bg-surface p-4">
              <p className="font-medium text-foreground">{t('visibilityHeading')}</p>
              <div className="mt-3 flex flex-col gap-2">
                {([false, true] as const).map((isPublic) => (
                  <button
                    key={String(isPublic)}
                    type="button"
                    onClick={() => update({ publishPublicly: isPublic })}
                    aria-pressed={publishPublicly === isPublic}
                    className={cn(
                      'rounded-input border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      publishPublicly === isPublic
                        ? 'border-primary bg-primary/5'
                        : 'border-input bg-surface hover:bg-muted',
                    )}
                  >
                    <span className="block font-medium text-foreground">
                      {isPublic ? t('visibilityPublicTitle') : t('visibilityDirectTitle')}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {isPublic ? t('visibilityPublicBody') : t('visibilityDirectBody')}
                    </span>
                  </button>
                ))}
              </div>

              {publishPublicly && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t('postingFeeLabel')}:{' '}
                  <span className="font-medium text-foreground">
                    {/* 0 reads as "Free", never as "FCFA 0" — a price of zero
                        stated as a number still reads as a charge. */}
                    {eligibility && eligibility.feeXaf > 0
                      ? t('postingFeeValue', {
                          amount: new Intl.NumberFormat(locale).format(eligibility.feeXaf),
                        })
                      : t('postingFeeFree')}
                  </span>
                </p>
              )}
            </div>
          )}

          <Field
            label={t('titleLabel')}
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder={publishPublicly ? t('titlePlaceholderPublic') : t('titlePlaceholder')}
            maxLength={140}
          />

          <div className="flex flex-col gap-2">
            <label htmlFor="job-description" className="text-sm font-medium text-foreground">
              {t('descriptionLabel')}
            </label>
            <textarea
              id="job-description"
              rows={5}
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder={
                publishPublicly ? t('descriptionPlaceholderPublic') : t('descriptionPlaceholder')
              }
              maxLength={5000}
              className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-surface-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">{t('categoryLabel')}</label>
            <Select
              value={draft.categoryId ?? undefined}
              onValueChange={(value) => update({ categoryId: value })}
            >
              <SelectTrigger aria-label={t('categoryLabel')}>
                <SelectValue placeholder={t('categoryPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {locale === 'fr' ? category.nameFr : category.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">{t('urgencyLabel')}</legend>
            <div className="flex flex-wrap gap-2">
              {JOB_URGENCIES.map((urgency) => (
                <UrgencyChip
                  key={urgency}
                  urgency={urgency}
                  label={t(`urgency.${urgency}`)}
                  active={draft.urgency === urgency}
                  onSelect={() => update({ urgency })}
                />
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-foreground">{t('photosLabel')}</label>
            <p className="text-xs text-muted-foreground">{t('photosHint')}</p>
            {photos.length > 0 && (
              <ul className="flex flex-wrap gap-3">
                {photos.map((photo) => (
                  <li
                    key={photo.id}
                    className="relative size-20 overflow-hidden rounded-image border border-border bg-muted"
                  >
                    {photo.url ? (
                      <RemoteImage src={photo.url} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
                        {t('photoAttached')}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      aria-label={t('removePhoto')}
                      className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 text-foreground shadow-sm hover:bg-background"
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {draft.photoAssetIds.length < 12 && (
              <AssetUploader kind="JOB_PHOTO" label={t('addPhoto')} onUploaded={onPhotoUploaded} />
            )}
          </div>
        </section>
      )}

      {step === 'location' && (
        <section className="flex flex-col gap-4" aria-labelledby="step-location">
          <h2 id="step-location" className="font-heading text-lg font-semibold text-foreground">
            {t('locationHeading')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('locationHint')}</p>
          <LocationSetter variant="outline" />
          {jobLocation && (
            <p className="rounded-card border border-border bg-surface px-4 py-3 text-sm text-surface-foreground">
              {jobLocation.landmark || jobLocation.label || t('locationSet')}
            </p>
          )}
        </section>
      )}

      {step === 'budget' && (
        <section className="flex flex-col gap-6" aria-labelledby="step-budget">
          <div>
            <h2 id="step-budget" className="font-heading text-lg font-semibold text-foreground">
              {t('budgetHeading')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('budgetRangeHint')}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label={t('budgetMinLabel')}
              inputMode="numeric"
              value={draft.budgetMin}
              onChange={(e) => update({ budgetMin: e.target.value })}
              placeholder="15000"
            />
            <Field
              label={t('budgetMaxLabel')}
              inputMode="numeric"
              value={draft.budgetMax}
              onChange={(e) => update({ budgetMax: e.target.value })}
              placeholder="25000"
              error={budgetOrderValid ? undefined : t('budgetOrderError')}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('budgetWholeHint')}</p>
        </section>
      )}

      {step === 'review' && (
        <section className="flex flex-col gap-4" aria-labelledby="step-review">
          <h2 id="step-review" className="font-heading text-lg font-semibold text-foreground">
            {t('reviewHeading')}
          </h2>

          {post.kind === 'posted' ? (
            // The draft is already cleared by the time this renders (submit()
            // clears it right before navigating away) — showing the review
            // table here would flash every field back to "Not set" for the
            // moment before the redirect to the job page lands.
            <FormBanner tone="success" message={t('posted')} />
          ) : (
            <>
              <dl className="divide-y divide-border rounded-card border border-border bg-surface">
                <ReviewRow label={t('titleLabel')} value={draft.title || t('notSet')} />
                <ReviewRow label={t('descriptionLabel')} value={draft.description || t('notSet')} />
                <ReviewRow
                  label={t('categoryLabel')}
                  value={
                    categories.find((c) => c.id === draft.categoryId)
                      ? locale === 'fr'
                        ? (categories.find((c) => c.id === draft.categoryId)?.nameFr ?? t('notSet'))
                        : (categories.find((c) => c.id === draft.categoryId)?.nameEn ?? t('notSet'))
                      : t('notSet')
                  }
                />
                <ReviewRow label={t('urgencyLabel')} value={t(`urgency.${draft.urgency}`)} />
                <ReviewRow
                  label={t('locationLabel')}
                  value={
                    jobLocation?.landmark ||
                    jobLocation?.label ||
                    // A pin with no landmark and no reverse-geocoded label is still
                    // a location — falling straight through to "Not set" contradicted
                    // the Location step, which had already confirmed "Location set".
                    (jobLocation
                      ? tLocation('coordinates', {
                          latitude: jobLocation.latitude.toFixed(4),
                          longitude: jobLocation.longitude.toFixed(4),
                        })
                      : t('notSet'))
                  }
                />
                <ReviewRow
                  label={t('budgetLabel')}
                  value={formatBudget(budgetMin, budgetMax, locale, t('budgetOpen'))}
                />
                <ReviewRow
                  label={t('photosLabel')}
                  value={t('photoCount', { count: draft.photoAssetIds.length })}
                />
                {canPostPublicly && (
                  <ReviewRow
                    label={t('visibilityReviewLabel')}
                    value={
                      publishPublicly ? t('visibilityPublicTitle') : t('visibilityDirectTitle')
                    }
                  />
                )}
              </dl>

              {canPostPublicly && publishPublicly && (
                <p className="text-sm text-muted-foreground">
                  {t('postingFeeLabel')}:{' '}
                  <span className="font-medium text-foreground">
                    {/* 0 reads as "Free", never as "FCFA 0" — a price of zero
                        stated as a number still reads as a charge. */}
                    {eligibility && eligibility.feeXaf > 0
                      ? t('postingFeeValue', {
                          amount: new Intl.NumberFormat(locale).format(eligibility.feeXaf),
                        })
                      : t('postingFeeFree')}
                  </span>
                </p>
              )}

              {post.kind === 'gated' && (
                <div className="rounded-card border border-warning/30 bg-warning/10 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
                    <div className="flex flex-col gap-1">
                      <p className="font-medium text-foreground">{t('gatedHeading')}</p>
                      <p className="text-sm text-muted-foreground">{post.message}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => router.push('/app/verification')}
                  >
                    {t('gatedCta')}
                  </Button>
                </div>
              )}

              {post.kind === 'error' && (
                <FormBanner tone="error" message={post.message} requestId={post.requestId} />
              )}
            </>
          )}
        </section>
      )}

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
        <Button
          variant="ghost"
          onClick={goBack}
          disabled={stepIndex === 0 || post.kind === 'working'}
        >
          <ChevronLeft aria-hidden />
          {t('back')}
        </Button>

        <p aria-live="polite" className="text-xs text-muted-foreground">
          {t('autosaved')}
        </p>

        {step === 'review' ? (
          <Button onClick={() => void submit()} disabled={!titleValid || post.kind === 'working'}>
            {post.kind === 'working' ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : (
              <Check aria-hidden />
            )}
            {t('submit')}
          </Button>
        ) : (
          <Button onClick={goNext} disabled={!canAdvance}>
            {t('next')}
            <ChevronRight aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

function StepProgress({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {labels.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'active' : 'todo';
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              aria-current={state === 'active' ? 'step' : undefined}
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                state === 'done' && 'border-success bg-success text-success-foreground',
                state === 'active' && 'border-primary bg-primary/10 text-primary',
                state === 'todo' && 'border-border bg-muted text-muted-foreground',
              )}
            >
              {state === 'done' ? <Check aria-hidden className="size-4" /> : index + 1}
            </span>
            <span
              className={cn(
                'hidden truncate text-sm sm:inline',
                state === 'active' ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            {index < labels.length - 1 && (
              <span
                aria-hidden
                className={cn('h-px flex-1', index < current ? 'bg-success' : 'bg-border')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function UrgencyChip({
  urgency,
  label,
  active,
  onSelect,
}: {
  urgency: JobUrgency;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      data-urgency={urgency}
      className={cn(
        'rounded-button border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary/10 font-medium text-primary'
          : 'border-input bg-surface text-surface-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground sm:max-w-[60%] sm:text-right">{value}</dd>
    </div>
  );
}

function formatBudget(
  min: number | null,
  max: number | null,
  locale: string,
  openLabel: string,
): string {
  const fmtMin = formatXaf(min, locale);
  const fmtMax = formatXaf(max, locale);
  if (fmtMin && fmtMax) return `${fmtMin} – ${fmtMax}`;
  if (fmtMin) return `${fmtMin}+`;
  if (fmtMax) return `≤ ${fmtMax}`;
  return openLabel;
}
