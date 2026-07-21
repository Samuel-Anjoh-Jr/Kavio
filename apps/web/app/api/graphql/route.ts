import { auth } from '@/auth';
import { getApiBaseUrl } from '@/lib/auth-api';

/**
 * Same-origin GraphQL proxy for BROWSER reads (DUAL API RULE: reads are GraphQL).
 *
 * The browser talks to this route, not to the API directly, so the access token
 * is attached here from the encrypted HTTP-only session cookie and never has to
 * be handed to client-side JavaScript. Guests are proxied through WITHOUT an
 * Authorization header rather than rejected — the guest first-interface (ACC-01)
 * genuinely browses over GraphQL, and the API decides per-resolver what an
 * anonymous caller may read.
 *
 * Server Components bypass this entirely and call the API directly (lib/apollo/rsc.ts).
 */
export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  const body = await request.text();

  const upstream = await fetch(`${getApiBaseUrl()}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Apollo Server's CSRF prevention requires a non-simple header; without it
      // the request is rejected before any resolver runs.
      'apollo-require-preflight': 'true',
      ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body,
    cache: 'no-store',
  });

  // Stream the upstream response through untouched so GraphQL errors keep their
  // { code, message, requestId } contract and the x-request-id stays traceable.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      ...(upstream.headers.get('x-request-id')
        ? { 'x-request-id': upstream.headers.get('x-request-id') as string }
        : {}),
    },
  });
}
