'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { restUpload, type UploadResult } from '@/lib/rest-api';

export type MediaKind =
  | 'PORTFOLIO_IMAGE'
  | 'NATIONAL_ID_FRONT'
  | 'NATIONAL_ID_BACK'
  | 'SELFIE'
  | 'BUSINESS_REGISTRATION'
  | 'BUSINESS_LOGO';

/** Mirrors the API's per-kind policy so the picker filters before uploading. */
const ACCEPT: Record<MediaKind, string> = {
  PORTFOLIO_IMAGE: 'image/jpeg,image/png,image/webp',
  NATIONAL_ID_FRONT: 'image/jpeg,image/png,image/webp,application/pdf',
  NATIONAL_ID_BACK: 'image/jpeg,image/png,image/webp,application/pdf',
  SELFIE: 'image/jpeg,image/png,image/webp',
  BUSINESS_REGISTRATION: 'image/jpeg,image/png,image/webp,application/pdf',
  BUSINESS_LOGO: 'image/jpeg,image/png,image/webp',
};

/**
 * Multipart upload with progress (ACC-10: "uploads land in S3 with validation").
 *
 * The client-side `accept` filter is convenience only — the API re-validates
 * size AND sniffs the actual bytes, because an accept attribute is trivially
 * bypassed and is not a security control.
 */
export function MediaUpload({
  kind,
  label,
  hint,
  onUploaded,
  capture,
}: {
  kind: MediaKind;
  label: string;
  hint?: string;
  onUploaded: (result: UploadResult) => void;
  /** Opens the front camera directly — used for the liveness selfie. */
  capture?: 'user' | 'environment';
}) {
  const t = useTranslations('Onboarding');
  const translateError = useAuthErrorMessage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File) {
    setError(null);
    setProgress(0);

    try {
      const result = await restUpload('uploads', file, { kind }, setProgress);
      onUploaded(result);
    } catch (err) {
      setError(translateError(err));
    } finally {
      setProgress(null);
      // Clear the input so picking the SAME file again still fires a change.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const uploading = progress !== null;

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[kind]}
        capture={capture}
        className="sr-only"
        aria-label={label}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onPick(file);
        }}
      />

      <Button
        type="button"
        variant="outline"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
        {uploading ? t('uploading', { percent: progress ?? 0 }) : label}
      </Button>

      {uploading && (
        <div
          role="progressbar"
          aria-valuenow={progress ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress ?? 0}%` }}
          />
        </div>
      )}

      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
