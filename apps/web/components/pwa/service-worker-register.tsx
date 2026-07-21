'use client';

import { useEffect } from 'react';

/**
 * Registers the app-shell service worker with its scope explicitly narrowed
 * to `/{locale}/app/`. Only ever rendered from `app/[locale]/app/layout.tsx`
 * — the marketing route group never mounts this, so the marketing landing
 * page is never registered, never controlled, and never shows an install
 * prompt (CLAUDE.md ACCESS MODEL: marketing stays "fast, crawlable,
 * SEO-first").
 */
export function ServiceWorkerRegister({ locale }: { locale: string }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: `/${locale}/app/` })
      .catch((error: unknown) => {
        console.error('[pwa] service worker registration failed', error);
      });
  }, [locale]);

  return null;
}
