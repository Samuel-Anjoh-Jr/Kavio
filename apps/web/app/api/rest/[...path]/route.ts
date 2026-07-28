import { auth } from '@/auth';
import { getApiBaseUrl } from '@/lib/auth-api';

/**
 * Same-origin proxy for REST WRITES (DUAL API RULE: every mutation is REST).
 *
 * Like the GraphQL proxy, this exists so the API access token is attached from
 * the HTTP-only session cookie server-side and never reaches browser JS.
 *
 * The allowlist is the security boundary. Without it this route would forward
 * ANY path to the API carrying the caller's bearer token — an open relay that
 * would let a single XSS reach every authenticated endpoint in the system. New
 * surfaces are added here deliberately, which is the point.
 */
const ALLOWED_PREFIXES = [
  'admin',
  'auth',
  'businesses',
  'conversations',
  'disputes',
  'emergency-contacts',
  'geo',
  'jobs',
  'messaging',
  'notifications',
  'onboarding',
  'payment-methods',
  'quotes',
  'reports',
  'reviews',
  'sos',
  'tracking',
  'uploads',
  'verifications',
] as const;

/** Methods a proxied write may use. GET is excluded: reads belong to GraphQL. */
const ALLOWED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Matches a whole leading segment, never a bare string prefix: `startsWith`
 * alone would let "uploads-evil" through on the strength of "uploads". The
 * allowlist names RESOURCE ROOTS; the API's own RBAC guards still authorise
 * every individual call behind them.
 */
function isAllowed(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

async function proxy(request: Request, segments: string[]): Promise<Response> {
  if (!ALLOWED_METHODS.has(request.method)) {
    return Response.json(
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Unsupported method.', requestId: 'local' } },
      { status: 405 },
    );
  }

  // Reject traversal before joining: a ".." segment could otherwise walk out of
  // an allowlisted prefix and reach an endpoint that was never approved.
  if (segments.some((segment) => segment === '..' || segment.includes('/'))) {
    return Response.json(
      { error: { code: 'NOT_FOUND', message: 'Unknown endpoint.', requestId: 'local' } },
      { status: 404 },
    );
  }

  const path = segments.join('/');

  if (!isAllowed(path)) {
    return Response.json(
      { error: { code: 'NOT_FOUND', message: 'Unknown endpoint.', requestId: 'local' } },
      { status: 404 },
    );
  }

  const session = await auth();
  const contentType = request.headers.get('content-type');

  const upstream = await fetch(`${getApiBaseUrl()}/${path}${new URL(request.url).search}`, {
    method: request.method,
    headers: {
      ...(contentType ? { 'Content-Type': contentType } : {}),
      // Locale drives which EN/FR notification template the API renders.
      ...(request.headers.get('accept-language')
        ? { 'accept-language': request.headers.get('accept-language') as string }
        : {}),
      ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: await request.arrayBuffer(),
    cache: 'no-store',
  });

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

type Context = { params: Promise<{ path: string[] }> };

export async function POST(request: Request, { params }: Context) {
  return proxy(request, (await params).path);
}

export async function PATCH(request: Request, { params }: Context) {
  return proxy(request, (await params).path);
}

export async function PUT(request: Request, { params }: Context) {
  return proxy(request, (await params).path);
}

export async function DELETE(request: Request, { params }: Context) {
  return proxy(request, (await params).path);
}
