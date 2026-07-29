'use client';

import { useEffect, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { usePathname, useRouter } from '@/i18n/navigation';

/**
 * Reacts to a refresh failure (ACC-05, ACC-09).
 *
 * The `jwt` callback in auth.ts already rotates the access token ahead of its
 * 15-minute expiry on every session read, so `session.error` only ever shows up
 * when the REFRESH token itself is dead — genuinely expired (30 days), revoked,
 * or caught by rotation-reuse detection. That is a real "you must sign in
 * again", not something more refreshing can fix. Without this watcher it would
 * only ever surface as an unexplained 401 on whatever the user happened to do
 * next; this turns it into a clean, explained bounce back to login that resumes
 * where they were.
 */
export function SessionWatcher() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (session?.error !== 'SessionExpired' || handled.current) return;
    // Already on an auth screen — nothing to bounce away from.
    if (pathname.startsWith('/auth')) return;

    handled.current = true;

    // Clears the now-dead cookie before redirecting, so the next `auth()` call
    // does not try (and fail) to refresh it all over again.
    void signOut({ redirect: false }).then(() => {
      router.push(`/auth/login?next=${encodeURIComponent(pathname)}&reason=session_expired`);
    });
  }, [session?.error, pathname, router]);

  return null;
}
