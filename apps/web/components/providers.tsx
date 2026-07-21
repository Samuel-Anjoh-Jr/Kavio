'use client';

import type { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import { ApolloProvider } from '@/lib/apollo/provider';
import { ThemeProvider } from '@/components/theme-provider';

/**
 * The single client-provider stack for every route group.
 *
 * SessionProvider wraps Apollo deliberately: the /api/graphql proxy authorises
 * from the session cookie, so a session that has just been refreshed (or swapped
 * by the Role Switcher) must be settled before a read goes out.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <ApolloProvider>{children}</ApolloProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
