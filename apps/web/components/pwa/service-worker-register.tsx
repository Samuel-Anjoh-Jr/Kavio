'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';

/**
 * Registers the app-shell service worker with its scope explicitly narrowed
 * to `/{locale}/app/`. Only ever rendered from `app/[locale]/app/layout.tsx`
 * — the marketing route group never mounts this, so the marketing landing
 * page is never registered, never controlled, and never shows an install
 * prompt (CLAUDE.md ACCESS MODEL: marketing stays "fast, crawlable,
 * SEO-first").
 *
 * It also relays notification clicks (PROMPT 77): when the worker focuses an
 * already-open tab after a push click, it posts the deep link here, and this
 * navigates the SPA client-side rather than triggering a full reload.
 */
export function ServiceWorkerRegister({ locale }: { locale: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: `/${locale}/app/` })
      .catch((error: unknown) => {
        console.error('[pwa] service worker registration failed', error);
      });

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type === 'notification-click' && typeof data.url === 'string') {
        // The URL is an app-relative path the API produced. The locale-aware
        // router prefixes the active locale, so `/app/messages/x` lands correctly.
        const path = data.url.replace(/^\/[a-z]{2}(?=\/)/, '');
        router.push(path.startsWith('/') ? path : `/${path}`);
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [locale, router]);

  return null;
}
