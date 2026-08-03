import { CombinedGraphQLErrors } from '@apollo/client/errors';

/**
 * The API's error CODE (e.g. `NO_BUSINESS`) for the first GraphQL error on a
 * failed query, or undefined for network errors and other non-GraphQL failures.
 * Mirrors the REST `ApiError.code` contract from `lib/api-error.ts` on the
 * GraphQL side, since Apollo Client 4 no longer surfaces `extensions` directly
 * on the `error` returned by `useQuery`.
 */
export function graphqlErrorCode(error: unknown): string | undefined {
  if (!CombinedGraphQLErrors.is(error)) return undefined;
  const code = error.errors[0]?.extensions?.code;
  return typeof code === 'string' ? code : undefined;
}
