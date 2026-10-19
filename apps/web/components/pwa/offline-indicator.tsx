'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useConnectivity, usePendingWriteCount, useWriteQueueSync } from '@/lib/offline/use-online';
import { setOfflineWriteMessage } from '@/lib/rest-api';
import { cn } from '@/lib/utils';

/**
 * The offline indicator (SYS-02, SYS-04).
 *
 * A slim bar pinned just under the sticky header. It is deliberately NOT a
 * modal or an overlay: it never covers the bottom nav or a primary action, it
 * takes no pointer events (taps and scrolls go straight through to the page),
 * and it appears only once offline is CONFIRMED by a probe
 * (lib/offline/connectivity.ts), not on the browser's word alone.
 *
 * It states three different things and never conflates them:
 *   1. Offline: what you are reading is the copy saved on this device.
 *   2. Back online: a brief confirmation while screens refresh, auto-dismissed.
 *   3. N changes waiting to sync: shown even once the network is back, until
 *      the queue actually drains.
 *
 * `role="status"` (polite) rather than `alert`: losing signal is not an
 * emergency, and an assertive announcement would interrupt whatever a screen
 * reader user was in the middle of reading. The live region stays mounted so
 * changes inside it are announced reliably.
 */

type Area = 'jobs' | 'messages' | 'other';

/** Which noun the copy uses, so the message speaks about the screen in hand. */
function areaOf(pathname: string): Area {
  if (pathname.startsWith('/app/jobs') || pathname.startsWith('/app/quotes')) return 'jobs';
  if (pathname.startsWith('/app/messages')) return 'messages';
  return 'other';
}

export function OfflineIndicator() {
  const t = useTranslations('SystemStates.offline');
  const { status, reconnected } = useConnectivity();
  const pending = usePendingWriteCount();
  const pathname = usePathname();
  const router = useRouter();

  // Owning the queue lifecycle here keeps it beside the UI that reports on it.
  useWriteQueueSync();

  // REST writes refuse to run offline with an inline, localized message
  // (lib/rest-api.ts). That module has no translator, so the shell hands it the
  // active locale's copy.
  const writeBlocked = t('writeBlocked');
  useEffect(() => {
    setOfflineWriteMessage(writeBlocked);
  }, [writeBlocked]);

  // Back online: refresh the server-rendered screen and re-check the session
  // (it was served from the offline copy, without an access token). Apollo re-runs its own active
  // queries (lib/apollo/provider.tsx).
  useEffect(() => {
    const onReconnected = () => {
      router.refresh();
      // Re-read the session in the background. Not `useSession().update()`:
      // that flips the status to "loading" for the round trip, which the header
      // renders as signed out, a false "you were logged out" flash on every
      // reconnect. SessionProvider re-reads quietly on visibilitychange.
      document.dispatchEvent(new Event('visibilitychange'));
    };
    window.addEventListener('kavio:reconnected', onReconnected);
    return () => window.removeEventListener('kavio:reconnected', onReconnected);
  }, [router]);

  const offline = status === 'offline';
  const syncing = !offline && pending > 0;
  const visible = offline || syncing || reconnected;

  let content: React.ReactNode = null;
  if (offline) {
    content = (
      <>
        <CloudOff className="size-4 shrink-0 text-warning" aria-hidden="true" />
        <span>
          {pending > 0
            ? t('bannerWithPending', { count: pending, area: areaOf(pathname) })
            : t('banner', { area: areaOf(pathname) })}
        </span>
      </>
    );
  } else if (syncing) {
    content = (
      <>
        {/* motion-safe: the spinner is decoration, and a user who asked for
            less motion should not get a permanently rotating element. */}
        <RefreshCw
          className="size-4 shrink-0 text-primary motion-safe:animate-spin"
          aria-hidden="true"
        />
        <span>{t('syncing', { count: pending })}</span>
      </>
    );
  } else if (reconnected) {
    content = (
      <>
        <Wifi className="size-4 shrink-0 text-success" aria-hidden="true" />
        <span>{t('backOnline')}</span>
      </>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
      data-state={
        offline ? 'offline' : syncing ? 'syncing' : reconnected ? 'reconnected' : 'hidden'
      }
      // Sticky under the 64px header so it stays in view while scrolling, and
      // pointer-events-none so it can never swallow a tap meant for the page.
      className={cn('pointer-events-none sticky top-16 z-30', visible ? 'block' : 'sr-only')}
    >
      {visible && (
        <div
          className={cn(
            'flex items-center justify-center gap-2 border-b px-4 py-1.5 text-center text-xs font-medium leading-snug sm:text-sm',
            'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1',
            // Text stays on the foreground token in both themes (the tinted
            // background alone carries the tone), so contrast holds in dark mode.
            'text-foreground backdrop-blur',
            offline
              ? 'border-warning/30 bg-warning/15'
              : syncing
                ? 'border-primary/20 bg-primary/10'
                : 'border-success/20 bg-success/10',
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
