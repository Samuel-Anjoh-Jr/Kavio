import { auth } from '@/auth';
import { getClient } from '@/lib/apollo/rsc';
import { TRUST_BREAKDOWN_QUERY, type TrustBreakdownQueryResult } from '@/lib/graphql/documents';
import type { TrustBreakdown } from '@/lib/trust';

export type TrustBreakdownLoad =
  { status: 'ok'; breakdown: TrustBreakdown } | { status: 'unauthenticated' } | { status: 'error' };

/**
 * Server-side Trust Score read (GraphQL, per the DUAL API RULE).
 *
 * Unlike loadOnboarding, a failure here does NOT fall back to a synthetic empty
 * value. An onboarding flow that starts at step one when the API is down is
 * harmless; a Trust Score that renders 0 / Basic Profile when the API is down is
 * a lie about the user's standing, and on a trust-first product that is the one
 * thing the screen must never do. The caller renders an error state instead.
 */
export async function loadTrustBreakdown(subjectId?: string): Promise<TrustBreakdownLoad> {
  const session = await auth();
  const viewerId = session?.user?.id;

  const target = subjectId ?? viewerId;
  if (!target) return { status: 'unauthenticated' };

  try {
    const client = await getClient();
    const { data } = await client.query<TrustBreakdownQueryResult>({
      query: TRUST_BREAKDOWN_QUERY,
      variables: { subjectId: target },
      // The score moves whenever a check is approved or a job completes; a
      // cached read would show a user the standing they had last visit.
      fetchPolicy: 'no-cache',
    });

    if (!data?.trustBreakdown) throw new Error('EMPTY_TRUST_BREAKDOWN_RESULT');

    return { status: 'ok', breakdown: data.trustBreakdown };
  } catch (error) {
    // console rather than lib/logger, matching auth.ts: that module is
    // 'use client' and importing it would pull this server-only file across the
    // client boundary.
    console.error(
      JSON.stringify({
        level: 'error',
        scope: 'trust.breakdown',
        msg: 'Trust breakdown read failed',
        subjectId: target,
        code: error instanceof Error ? error.message : 'UNKNOWN',
        timestamp: new Date().toISOString(),
      }),
    );
    return { status: 'error' };
  }
}
