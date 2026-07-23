'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/lib/logger';

const logger = createLogger('pwa-install');

/**
 * The custom install prompt (SYS-01).
 *
 * TIMING IS THE FEATURE. Chrome's own banner is suppressed by
 * `preventDefault()` so we choose the moment instead, and the moment is
 * deliberately not "on arrival": a visitor who has seen one screen has no reason
 * to install anything, and an instant prompt is the single most reliable way to
 * teach someone to dismiss you forever. It waits for evidence of intent —
 * ENGAGEMENT_MS of actual time in the app shell — and a dismissal is remembered
 * for DISMISS_COOLDOWN_DAYS rather than asked again next navigation.
 *
 * iOS gets a different treatment because it has to: Safari implements no
 * `beforeinstallprompt` and no programmatic install at all. There, the only
 * honest thing is to show the Share → Add to Home Screen instruction, and only
 * to users who are not already running standalone.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'trustpro:install-dismissed-at';
const DISMISS_COOLDOWN_DAYS = 30;
const ENGAGEMENT_MS = 45_000;

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const age = Date.now() - Number(raw);
    return Number.isFinite(age) && age < DISMISS_COOLDOWN_DAYS * 86_400_000;
  } catch {
    // Storage blocked (private mode). Erring toward NOT prompting is the kinder
    // failure: a missed prompt costs an install, a repeated one costs trust.
    return true;
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari's own non-standard flag, still the only signal on iOS.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const t = useTranslations('Pwa.install');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    // The iOS hint decision is folded into the engagement timer rather than set
    // synchronously in the effect body: iOS has no `beforeinstallprompt`, so the
    // only trigger it would ever get is time-based anyway, and deferring it keeps
    // this effect free of a synchronous setState (which forces a cascading
    // render). Both branches surface at the same, intentional moment.
    const ios = isIos();
    const timer = setTimeout(() => {
      setEngaged(true);
      if (ios) setShowIosHint(true);
    }, ENGAGEMENT_MS);

    const onBeforeInstall = (event: Event) => {
      // Suppress the browser's banner so ours can pick the moment.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setDeferred(null);
      setShowIosHint(false);
      logger.info('PWA installed');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Nothing to do — the banner still closes for this session.
    }
    setDeferred(null);
    setShowIosHint(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    logger.info('Install prompt answered', { payload: { outcome } });

    // The event is single-use either way; a dismissal also starts the cooldown.
    if (outcome === 'dismissed') dismiss();
    setDeferred(null);
  }, [deferred, dismiss]);

  // `engaged` gates both branches: the install button appears once the deferred
  // event AND the engagement delay have both arrived, so a fast-firing
  // `beforeinstallprompt` never shows the prompt before the visitor has done
  // anything.
  const visible = engaged && (deferred !== null || showIosHint);
  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label={t('title')}
      className="fixed inset-x-3 bottom-20 z-50 flex items-start gap-3 rounded-card bg-surface p-4 shadow-lg md:inset-x-auto md:right-6 md:bottom-6 md:max-w-sm"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-input bg-primary/10 text-primary">
        <Download className="size-5" aria-hidden="true" />
      </span>

      <div className="flex flex-1 flex-col gap-2">
        <p className="font-heading text-sm font-semibold text-surface-foreground">{t('title')}</p>
        <p className="text-sm text-muted-foreground">{t('description')}</p>

        {deferred ? (
          <div className="flex gap-2 pt-1">
            {/* Accent on the primary CTA — the 10% of the 60/30/10 ratio
                (BRAND_GUIDELINES.md, SRS §26.2). */}
            <Button size="sm" variant="accent" onClick={() => void install()}>
              {t('action')}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              {t('later')}
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 pt-1 text-sm text-muted-foreground">
            <Share className="size-4 shrink-0" aria-hidden="true" />
            {t('iosHint')}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label={t('dismiss')}
        className="rounded-button p-1 text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
