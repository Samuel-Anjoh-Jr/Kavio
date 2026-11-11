'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { Camera, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ME_QUERY, type MeQueryResult } from '@/lib/graphql/documents';

const DISMISS_KEY = 'kavio:add-photo-banner:dismissedAt';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * A small nudge for people without a profile photo: workers and clients both
 * respond better to a face. Dismissable for two weeks; gone once a photo exists.
 */
export function AddPhotoBanner() {
  const t = useTranslations('ProfileSettings.photoBanner');
  const { data } = useQuery<MeQueryResult>(ME_QUERY, { fetchPolicy: 'cache-first' });
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    try {
      const at = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage once after mount
      setSnoozed(Boolean(at) && Date.now() - at < SNOOZE_MS);
    } catch {
      setSnoozed(false);
    }
  }, []);

  if (!data?.me || data.me.avatar || snoozed) return null;

  return (
    <div className="flex items-center gap-3 rounded-card border border-primary/20 bg-primary/5 px-4 py-3">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Camera aria-hidden className="size-5" />
      </span>
      <p className="min-w-0 flex-1 text-sm text-foreground">
        <span className="font-semibold">{t('title')}</span>{' '}
        <span className="text-muted-foreground">{t('body')}</span>
      </p>
      <Link
        href="/app/settings/profile"
        className="shrink-0 rounded-button bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('cta')}
      </Link>
      <button
        type="button"
        aria-label={t('dismiss')}
        onClick={() => {
          try {
            window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
          } catch {
            // Storage blocked: hide for this visit only.
          }
          setSnoozed(true);
        }}
        className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
