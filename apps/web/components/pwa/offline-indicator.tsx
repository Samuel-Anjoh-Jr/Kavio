'use client';

import { useTranslations } from 'next-intl';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useIsOnline, usePendingWriteCount, useWriteQueueSync } from '@/lib/offline/use-online';

/**
 * The offline indicator the PWA requirement asks for by name (SYS-02, SYS-04).
 *
 * Mounted once in the app shell, below the header. It states two different
 * things and never conflates them:
 *
 *   1. "You are offline, what you're reading is saved content" — so a stale
 *      profile is never mistaken for a live one.
 *   2. "N changes are waiting to sync" — shown even once the network is BACK,
 *      until the queue actually drains. A user who edited a job draft on the bus
 *      is owed an explicit "it landed", not a silent banner dismissal that looks
 *      identical to the work having been lost.
 *
 * `role="status"` (polite) rather than `alert`: losing signal is not an
 * emergency, and an assertive announcement would interrupt whatever a screen
 * reader user was in the middle of reading.
 */
export function OfflineIndicator() {
  const t = useTranslations('SystemStates.offline');
  const isOnline = useIsOnline();
  const pending = usePendingWriteCount();

  // Owning the queue lifecycle here keeps it beside the UI that reports on it.
  useWriteQueueSync();

  if (isOnline && pending === 0) return null;

  const syncing = isOnline && pending > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        syncing
          ? 'flex items-center justify-center gap-2 bg-primary/10 px-4 py-2 text-sm text-primary'
          : 'flex items-center justify-center gap-2 bg-warning/15 px-4 py-2 text-sm text-warning-foreground'
      }
    >
      {syncing ? (
        <>
          {/* motion-safe: the spinner is decoration, and a user who asked for
              less motion should not get a permanently rotating element. */}
          <RefreshCw className="size-4 motion-safe:animate-spin" aria-hidden="true" />
          <span>{t('syncing', { count: pending })}</span>
        </>
      ) : (
        <>
          <CloudOff className="size-4" aria-hidden="true" />
          <span>{pending > 0 ? t('bannerWithPending', { count: pending }) : t('banner')}</span>
        </>
      )}
    </div>
  );
}
