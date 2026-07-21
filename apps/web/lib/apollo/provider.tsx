'use client';

import type { ReactNode } from 'react';
import { HttpLink } from '@apollo/client';
import { ApolloClient, ApolloNextAppProvider } from '@apollo/client-integration-nextjs';
import { createCache } from './cache';

/**
 * Apollo for CLIENT COMPONENTS. Points at the same-origin /api/graphql proxy,
 * which attaches the bearer token from the session cookie server-side — so the
 * browser never holds an API access token in JavaScript.
 */
function makeClient() {
  return new ApolloClient({
    cache: createCache(),
    link: new HttpLink({
      uri: '/api/graphql',
      // Sends the Auth.js session cookie, which is what the proxy reads.
      credentials: 'same-origin',
    }),
  });
}

export function ApolloProvider({ children }: { children: ReactNode }) {
  return <ApolloNextAppProvider makeClient={makeClient}>{children}</ApolloNextAppProvider>;
}
