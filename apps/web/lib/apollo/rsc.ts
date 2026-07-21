import { HttpLink } from '@apollo/client';
import { ApolloClient, registerApolloClient } from '@apollo/client-integration-nextjs';
import { auth } from '@/auth';
import { getApiBaseUrl } from '@/lib/auth-api';
import { createCache } from './cache';

/**
 * Apollo for SERVER COMPONENTS (DUAL API RULE: every read is GraphQL).
 *
 * `registerApolloClient` gives each request its own client, so one visitor's
 * normalized cache can never be served to another — the mistake that turns a
 * shared server cache into a data leak. Server components call the API directly
 * with a bearer token; the browser goes through /api/graphql instead.
 */
export const { getClient, query, PreloadQuery } = registerApolloClient(async () => {
  const session = await auth();

  return new ApolloClient({
    cache: createCache(),
    link: new HttpLink({
      uri: `${getApiBaseUrl()}/graphql`,
      headers: {
        'apollo-require-preflight': 'true',
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
      // Identity and onboarding reads are per-user and must never be served from
      // Next's data cache.
      fetchOptions: { cache: 'no-store' },
    }),
  });
});
