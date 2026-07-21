import { auth } from '@/auth';
import { getClient } from '@/lib/apollo/rsc';
import {
  MY_VERIFICATIONS_QUERY,
  TRUST_BREAKDOWN_QUERY,
  type MyVerificationsQueryResult,
  type TrustBreakdownQueryResult,
} from '@/lib/graphql/documents';
import type { Tier, VerificationRecord } from '@/lib/verification';

export type VerificationLoad =
  | { status: 'ok'; records: VerificationRecord[]; tier: Tier }
  | { status: 'unauthenticated' }
  | { status: 'error' };

/**
 * Server-side reads for the verification screen (GraphQL, per the DUAL API RULE).
 *
 * Two queries in parallel rather than one round trip each: the checks and the
 * tier are independent, and on a Cameroonian mobile connection the difference
 * between one wait and two is the difference between a screen that feels instant
 * and one that does not.
 *
 * Like loadTrustBreakdown, a failure does NOT fall back to an empty journey —
 * showing a verified worker 0% because the API is down would be a lie about
 * their standing.
 */
export async function loadVerification(): Promise<VerificationLoad> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };

  try {
    const client = await getClient();

    const [verifications, breakdown] = await Promise.all([
      client.query<MyVerificationsQueryResult>({
        query: MY_VERIFICATIONS_QUERY,
        // Checks change the moment a reviewer decides one; a cached read would
        // show a worker a rejection they have already fixed.
        fetchPolicy: 'no-cache',
      }),
      client.query<TrustBreakdownQueryResult>({
        query: TRUST_BREAKDOWN_QUERY,
        variables: { subjectId: session.user.id },
        fetchPolicy: 'no-cache',
      }),
    ]);

    const records = verifications.data?.myVerifications;
    const tier = breakdown.data?.trustBreakdown?.tier;

    if (!records || !tier) throw new Error('EMPTY_VERIFICATION_RESULT');

    return { status: 'ok', records, tier: tier as Tier };
  } catch (error) {
    // console rather than lib/logger: that module is 'use client' and importing
    // it would pull this server-only file across the client boundary.
    console.error(
      JSON.stringify({
        level: 'error',
        scope: 'verification.screen',
        msg: 'Verification read failed',
        subjectId: session.user.id,
        code: error instanceof Error ? error.message : 'UNKNOWN',
        timestamp: new Date().toISOString(),
      }),
    );
    return { status: 'error' };
  }
}
