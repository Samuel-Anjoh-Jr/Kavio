'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useToast } from '@/components/ui/use-toast';
import { navigateToNotification } from '@/lib/notification-navigation';
import type { NotificationRelevantRole } from '@/lib/graphql/notifications';

/**
 * Registers the app-shell service worker with its scope explicitly narrowed
 * to `/{locale}/app` (no trailing slash, so the manifest's
 * `/{locale}/app?source=pwa` start_url is covered and the installed app can
 * launch offline; see public/sw.js). Only ever rendered from `app/[locale]/app/layout.tsx`
 * — the marketing route group never mounts this, so the marketing landing
 * page is never registered, never controlled, and never shows an install
 * prompt (CLAUDE.md ACCESS MODEL: marketing stays "fast, crawlable,
 * SEO-first").
 *
 * It also relays notification clicks (PROMPT 77): when the worker focuses an
 * already-open tab after a push click, it posts the deep link here, and this
 * navigates the SPA client-side rather than triggering a full reload — first
 * switching active role if the notice was about a role the viewer is not
 * currently acting as (see lib/notification-navigation.ts).
 *
 * A second message type, `notification-push`, fires the instant a push
 * ARRIVES while a tab is open (not just on click) — sw.js relays the raw
 * payload here as a plain `window` CustomEvent so anything interested (the
 * sound player, the bell's live refresh) can react without this component
 * needing to know about either.
 */
/**
 * Earlier builds registered with a trailing-slash scope (`/{locale}/app/`).
 * That registration would keep controlling every page under it (the longest
 * matching scope wins) while missing the app root, so it is removed once the
 * correct one exists. It keeps the current page until the next load; nothing
 * breaks in between.
 */
async function retireLegacyRegistrations(scope: string) {
  const legacy = new URL(`${scope}/`, window.location.origin).href;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.filter((r) => r.scope === legacy).map((r) => r.unregister()));
}

export function ServiceWorkerRegister({ locale }: { locale: string }) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const { toast } = useToast();
  const tRoles = useTranslations('Roles');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const scope = `/${locale}/app`;
    navigator.serviceWorker
      .register('/sw.js', { scope })
      .then(() => retireLegacyRegistrations(scope))
      .catch((error: unknown) => {
        console.error('[pwa] service worker registration failed', error);
      });

    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        url?: string;
        relevantRole?: NotificationRelevantRole;
        payload?: Record<string, unknown>;
      } | null;

      if (data?.type === 'notification-click' && typeof data.url === 'string') {
        void navigateToNotification({
          notification: { url: data.url, relevantRole: data.relevantRole ?? null },
          activeRole: session?.user?.activeRole,
          roles: session?.user?.roles,
          refreshSession: update,
          navigate: (path) => router.push(path),
          onRoleSwitched: (role) =>
            toast({ title: tRoles('switched', { role: tRoles(`names.${role}`) }) }),
        });
        return;
      }

      if (data?.type === 'notification-push') {
        // A plain DOM event, not React state: this fires whether or not any
        // particular component happens to be mounted, and multiple listeners
        // (sound, the bell's badge) can each pick it up independently.
        window.dispatchEvent(
          new CustomEvent('kavio:notification-push', { detail: data.payload ?? {} }),
        );
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [locale, router, session, update, toast, tRoles]);

  return null;
}
