import { getClient } from '@/lib/apollo/rsc';
import { BUSINESS_PROFILE_QUERY, type BusinessProfileQueryResult } from '@/lib/graphql/discovery';

export type BusinessProfileLoad =
  | { status: 'ok'; profile: BusinessProfileQueryResult['businessProfile'] }
  | { status: 'not-found' }
  | { status: 'error' };

/**
 * Server-side company profile read (GraphQL, per the DUAL API RULE).
 *
 * Same split as the worker loader: a missing company is a 404 to navigate away
 * from, an unreachable API is a temporary failure to retry, and the two need
 * opposite screens. No synthetic fallback — an unverified-looking shell for a
 * verified business is a lie about a real company's standing.
 */
export async function loadBusinessProfile(id: string): Promise<BusinessProfileLoad> {
  try {
    const client = await getClient();
    const { data } = await client.query<BusinessProfileQueryResult>({
      query: BUSINESS_PROFILE_QUERY,
      variables: { id },
      fetchPolicy: 'no-cache',
      errorPolicy: 'none',
    });

    if (!data?.businessProfile) return { status: 'not-found' };
    return { status: 'ok', profile: data.businessProfile };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    const missing = /NOT_FOUND|BUSINESS_NOT_FOUND|404/i.test(message);

    if (!missing) {
      console.error(
        JSON.stringify({
          level: 'error',
          scope: 'profile.business',
          msg: 'Business profile read failed',
          businessId: id,
          code: message,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    return { status: missing ? 'not-found' : 'error' };
  }
}
