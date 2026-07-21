'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthErrorMessage } from '@/lib/auth-errors';
import { restUpload, type UploadResult } from '@/lib/rest-api';

/**
 * A generic multipart uploader with real progress, reused across the
 * transactional surfaces — job photos (JOB-02), quote attachments (QTE-01) and
 * dispute evidence (PAY-03). It is the transaction-side peer of the onboarding
 * MediaUpload: same S3-via-REST path, different set of asset kinds.
 *
 * The `accept` filter is convenience only; the API re-validates size and sniffs
 * the actual bytes, because an accept attribute is trivially bypassed.
 */
export function AssetUploader({
  kind,
  label,
  accept = 'image/jpeg,image/png,image/webp',
  disabled,
  onUploaded,
}: {
  /** A MediaAssetKind: JOB_PHOTO, QUOTE_ATTACHMENT, DISPUTE_EVIDENCE, … */
  kind: string;
  label: string;
  accept?: string;
  disabled?: boolean;
  onUploaded: (result: UploadResult) => void;
}) {
  const t = useTranslations('Transactions');
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
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const uploading = progress !== null;

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
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
        disabled={uploading || disabled}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 aria-hidden className="animate-spin" /> : <Paperclip aria-hidden />}
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

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
