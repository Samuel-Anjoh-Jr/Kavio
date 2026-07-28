'use client';

import type { NotificationRelevantRole } from '@/lib/graphql/notifications';
import { restPost } from '@/lib/rest-api';

/**
 * Opening a notification whose CONTENT is about a role you're not currently
 * acting as (JOB-03, NOT-02).
 *
 * A worker invitation, a quote reply, an escrow update — every notification
 * that carries a `relevantRole` was generated because the viewer holds that
 * role, but the SESSION they're browsing in right now might be a different
 * one (CLAUDE.md ACCESS MODEL: one identity, several roles, the active one is
 * a session concept, not a URL segment). Most destinations render fine either
 * way — job/dispute/message screens key off the viewer's relationship to the
 * RECORD, not the active role — but the surrounding nav/dashboard chrome
 * still reflects whichever role is active, which reads as wrong the instant
 * you land on a Worker-side notice while the app still says "Client". So:
 * switch first, THEN navigate, exactly the way the role switcher itself does
 * it (POST the switch, refresh the session, only then act on the new state).
 *
 * Silently a no-op when there is nothing to switch to (no role on the
 * notice, already the active role, or the viewer never held that role at
 * all — which should not happen since the notice was generated for them, but
 * a stale session must never block a click over it).
 */
export interface NavigateToNotificationArgs {
  notification: { url: string | null; relevantRole?: NotificationRelevantRole };
  activeRole: string | null | undefined;
  /** Roles the signed-in identity currently holds. */
  roles: readonly string[] | undefined;
  /** Refreshes the NextAuth session so the new activeRole claim takes effect. */
  refreshSession: () => Promise<unknown>;
  /** Locale-aware navigation (e.g. next-intl's router.push). */
  navigate: (path: string) => void;
  /** Called after a successful switch, before navigating — e.g. to show a toast. */
  onRoleSwitched?: (role: string) => void;
}

export async function navigateToNotification({
  notification,
  activeRole,
  roles,
  refreshSession,
  navigate,
  onRoleSwitched,
}: NavigateToNotificationArgs): Promise<void> {
  if (!notification.url) return;

  const targetRole = notification.relevantRole;
  if (targetRole && targetRole !== activeRole && (roles ?? []).includes(targetRole)) {
    try {
      await restPost('auth/roles/switch', { role: targetRole });
      await refreshSession();
      onRoleSwitched?.(targetRole);
    } catch {
      // The switch failing must not trap the click — better to land on the
      // record in the wrong role's chrome than to go nowhere at all.
    }
  }

  navigate(stripLocalePrefix(notification.url));
}

/** Deep links from the API are locale-agnostic app paths; strip a stray prefix defensively. */
function stripLocalePrefix(url: string): string {
  const stripped = url.replace(/^\/[a-z]{2}(?=\/)/, '');
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}
