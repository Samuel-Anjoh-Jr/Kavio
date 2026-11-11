'use client';

import { useRef, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { Camera, Loader2, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormBanner } from '@/components/auth/form-banner';
import { ApiError } from '@/lib/api-error';
import { ME_QUERY } from '@/lib/graphql/documents';
import { restPost, restUpload } from '@/lib/rest-api';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Profile photo: a real face next to the name on profiles, quotes and
 * bookings builds trust. Upload (POST /uploads kind PROFILE_PHOTO) then set
 * (POST /auth/avatar); remove sets it back to none.
 */
export function ProfilePhotoSection({ avatar }: { avatar: string | null }) {
  const t = useTranslations('ProfileSettings.photo');
  const client = useApolloClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function refresh() {
    await client.refetchQueries({ include: [ME_QUERY] });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSaved(false);
    if (!file.type.startsWith('image/')) {
      setError(t('notImage'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('tooBig'));
      return;
    }
    setBusy(true);
    try {
      const uploaded = await restUpload('uploads', file, { kind: 'PROFILE_PHOTO' }, setProgress);
      await restPost('auth/avatar', { assetId: uploaded.id });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('failed'));
    } finally {
      setBusy(false);
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await restPost('auth/avatar', { assetId: null });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h2 className="font-heading text-lg font-semibold text-foreground">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('hint')}</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-full bg-muted">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote CDN avatar
            <img src={avatar} alt={t('alt')} className="size-full object-cover" />
          ) : (
            <UserRound aria-hidden className="m-auto mt-5 size-10 text-muted-foreground" />
          )}
          {busy ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 font-numeric text-xs font-semibold text-white">
              {progress !== null ? `${progress}%` : <Loader2 className="size-5 animate-spin" />}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="user"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
            aria-label={t('choose')}
          />
          <Button type="button" onClick={() => input.current?.click()} disabled={busy}>
            <Camera aria-hidden />
            {avatar ? t('change') : t('add')}
          </Button>
          {avatar ? (
            <Button type="button" variant="ghost" onClick={() => void onRemove()} disabled={busy}>
              <Trash2 aria-hidden />
              {t('remove')}
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <div className="mt-3">
          <FormBanner tone="error" message={error} />
        </div>
      ) : saved ? (
        <div className="mt-3">
          <FormBanner tone="success" message={t('saved')} />
        </div>
      ) : null}
    </section>
  );
}
