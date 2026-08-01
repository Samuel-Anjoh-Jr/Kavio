'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { RemoteImage } from '@/components/ui/remote-image';
import { AssetUploader } from '@/components/uploads/asset-uploader';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { REVIEW_ELIGIBILITY_QUERY, type ReviewEligibilityQueryResult } from '@/lib/graphql/reviews';
import {
  createReview,
  REVIEW_PHOTO_MAX,
  REVIEW_TEXT_MAX,
  type CreateReviewInput,
} from '@/lib/reviews';
import { StarRatingInput } from './star-rating';

interface PendingPhoto {
  id: string;
  url: string | null;
}

/**
 * Leaving a review after a completed job (REV-01).
 *
 * Eligibility is asked of the SERVER before the form is drawn, and the coded
 * reason behind a refusal is shown as a sentence rather than a disabled button
 * with no explanation — a client whose review is blocked because the job is not
 * marked complete can act on that, whereas a dead button just looks broken.
 *
 * The stars are the only required field. REV-01 asks for a rating plus an
 * optional review, and demanding prose is how a marketplace ends up with a
 * thin, unrepresentative sample of loud opinions.
 *
 * Photos upload FIRST, to their own REVIEW_PHOTO asset kind, and only their ids
 * are submitted. That keeps the client's photo of delivered work off the
 * worker's portfolio evidence, which the Trust Engine counts.
 */
export function ReviewForm({ jobId, jobTitle }: { jobId: string; jobTitle?: string }) {
  const t = useTranslations('Reviews');
  const translateError = useAuthErrorMessage();
  const router = useRouter();

  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { data, loading } = useQuery<ReviewEligibilityQueryResult>(REVIEW_ELIGIBILITY_QUERY, {
    variables: { jobId },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const eligibility = data?.reviewEligibility;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (rating === 0) {
      setError(t('ratingRequired'));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload: CreateReviewInput = { jobId, rating };
      const trimmed = text.trim();
      if (trimmed) payload.text = trimmed;
      if (photos.length > 0) payload.photoAssetIds = photos.map((photo) => photo.id);

      const created = await createReview(payload);
      setDone(true);
      // Straight to the profile the review now appears on — the point of
      // leaving one is seeing it land. Only a worker HAS a public profile;
      // reviewing a client (the other direction this form serves) has nowhere
      // equivalent to go, so that case lands back on the job instead.
      if (eligibility?.subjectIsWorker) {
        router.push(`/app/workers/${created.subjectId}`);
      } else {
        router.push(`/app/jobs/${jobId}`);
      }
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-32 w-full rounded-card" />
      </div>
    );
  }

  if (eligibility && !eligibility.allowed) {
    return (
      <div className="rounded-card border border-border bg-surface p-6">
        <p className="font-medium text-foreground">{t('notEligibleTitle')}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(`ineligible.${eligibility.reason}`)}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push(`/app/jobs/${jobId}`)}
        >
          {t('backToJob')}
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card border border-success/30 bg-success/5 p-8 text-center">
        <CheckCircle2 aria-hidden className="size-8 text-success" />
        <p className="font-medium text-foreground">{t('submitSuccess')}</p>
        <p className="text-sm text-muted-foreground">{t('submitSuccessBody')}</p>
      </div>
    );
  }

  const remaining = REVIEW_TEXT_MAX - text.length;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {jobTitle && <p className="text-sm text-muted-foreground">{t('onJob', { job: jobTitle })}</p>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="rating-group">{t('ratingLabel')}</Label>
        <div id="rating-group">
          <StarRatingInput value={rating} onChange={setRating} disabled={submitting} />
        </div>
        <p className="text-xs text-muted-foreground">{t('ratingHint')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="review-text">{t('textLabel')}</Label>
        <textarea
          id="review-text"
          value={text}
          maxLength={REVIEW_TEXT_MAX}
          rows={5}
          disabled={submitting}
          placeholder={t('textPlaceholder')}
          onChange={(event) => setText(event.target.value)}
          className="w-full rounded-input border border-input bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        />
        <p className="text-right text-xs text-muted-foreground" aria-live="polite">
          {t('charactersLeft', { count: remaining })}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Label>{t('photosLabel')}</Label>

        {photos.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {photos.map((photo) => (
              <li key={photo.id} className="relative">
                {photo.url ? (
                  <RemoteImage
                    src={photo.url}
                    alt={t('photoPending')}
                    className="size-20 rounded-image object-cover"
                  />
                ) : (
                  <span className="flex size-20 items-center justify-center rounded-image bg-muted" />
                )}
                <button
                  type="button"
                  onClick={() => setPhotos((current) => current.filter((p) => p.id !== photo.id))}
                  aria-label={t('removePhoto')}
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-danger p-1 text-danger-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {photos.length < REVIEW_PHOTO_MAX && (
          <AssetUploader
            kind="REVIEW_PHOTO"
            label={t('addPhoto')}
            disabled={submitting}
            onUploaded={(result) =>
              setPhotos((current) => [...current, { id: result.id, url: result.url }])
            }
          />
        )}
        <p className="text-xs text-muted-foreground">
          {t('photosHint', { max: REVIEW_PHOTO_MAX })}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" disabled={submitting || rating === 0}>
        {submitting && <Loader2 aria-hidden className="animate-spin" />}
        {submitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
