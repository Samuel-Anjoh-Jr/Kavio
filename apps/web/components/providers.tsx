'use client';

import type { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import { SessionWatcher } from '@/components/auth/session-watcher';
import { ApolloProvider } from '@/lib/apollo/provider';
import { ThemeProvider } from '@/components/theme-provider';

/**
 * Well under the 15-minute access-token TTL, so a long-lived open tab (a chat,
 * a live-tracking screen — anything reading `session.accessToken` straight off
 * `useSession()`) always has a fresh token instead of one that only rotates on
 * the next window focus or full reload.
 */
const SESSION_REFETCH_INTERVAL_SECONDS = 4 * 60;

/**
 * The single client-provider stack for every route group.
 *
 * SessionProvider wraps Apollo deliberately: the /api/graphql proxy authorises
 * from the session cookie, so a session that has just been refreshed (or swapped
 * by the Role Switcher) must be settled before a read goes out. SessionWatcher
 * lives inside it so it sees the same session the rest of the tree does.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {/* refetchWhenOffline={false}: next-auth turns a failed session poll into
          `null`, i.e. "signed out", and then stops polling for good. Offline,
          the service worker answers /api/auth/session from its last good copy
          (public/sw.js), and not polling at all avoids even asking. */}
      <SessionProvider
        refetchInterval={SESSION_REFETCH_INTERVAL_SECONDS}
        refetchOnWindowFocus
        refetchWhenOffline={false}
      >
        <SessionWatcher />
        <ApolloProvider>{children}</ApolloProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
