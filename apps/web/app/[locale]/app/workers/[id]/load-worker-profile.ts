import { getClient } from '@/lib/apollo/rsc';
import { WORKER_PROFILE_QUERY, type WorkerProfileQueryResult } from '@/lib/graphql/discovery';

export type WorkerProfileLoad =
  | { status: 'ok'; profile: WorkerProfileQueryResult['workerProfile'] }
  | { status: 'not-found' }
  | { status: 'error' };

/**
 * Server-side worker profile read (GraphQL, per the DUAL API RULE).
 *
 * "Not found" and "the API is down" are separated deliberately, because they
 * need opposite screens: a missing profile is a 404 the visitor should navigate
 * away from, while a failed read is a temporary problem they should retry. A
 * single catch-all would send everyone to the wrong one half the time.
 *
 * There is no synthetic fallback profile. Rendering an empty shell with a zero
 * Trust Score when the API is unreachable would be a lie about a real person's
 * standing, and on a trust-first product that is the one thing this screen must
 * never do.
 */
export async function loadWorkerProfile(userId: string): Promise<WorkerProfileLoad> {
  try {
    const client = await getClient();
    const { data } = await client.query<WorkerProfileQueryResult>({
      query: WORKER_PROFILE_QUERY,
      variables: { userId },
      // The score and the portfolio move whenever a check is approved or a job
      // completes; a cached read would show last visit's standing.
      fetchPolicy: 'no-cache',
      errorPolicy: 'none',
    });

    if (!data?.workerProfile) return { status: 'not-found' };
    return { status: 'ok', profile: data.workerProfile };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    const missing = /NOT_FOUND|PROFILE_NOT_FOUND|404/i.test(message);

    if (!missing) {
      // console rather than lib/logger: that module is 'use client', and
      // importing it here would drag this server-only file across the boundary.
      console.error(
        JSON.stringify({
          level: 'error',
          scope: 'profile.worker',
          msg: 'Worker profile read failed',
          userId,
          code: message,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    return { status: missing ? 'not-found' : 'error' };
  }
}
