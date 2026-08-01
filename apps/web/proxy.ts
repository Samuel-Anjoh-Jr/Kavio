import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { auth } from './auth';
import { routing, type Locale } from './i18n/routing';

const handleI18n = createMiddleware(routing);

/**
 * Planned-downtime switch (SYS-04). Read once at module scope rather than per
 * request: flipping maintenance on is a deploy-level decision, and a per-request
 * env read would only buy the illusion that it is hot-swappable.
 */
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'on';

/** The locale a request is already prefixed with, if any. */
function localeOf(pathname: string): Locale | null {
  return (
    routing.locales.find(
      (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
    ) ?? null
  );
}

/**
 * Wrapped in `auth(...)` — not called bare — so this runs on every matched
 * request (ACC-05), API routes included. A Server Component's `await auth()`
 * can compute a freshly rotated token for its own render, but Next.js gives it
 * no way to write that rotation back to the browser's cookie; every OTHER
 * independent call on the same stale cookie (another RSC render, the
 * GraphQL/REST proxies, a poll) then re-presents that same already-rotated
 * token and gets treated as a replay, revoking the whole session family out
 * from under a legitimate client. Middleware is the one layer Next.js lets
 * rewrite the response cookie on every request, so wrapping it in `auth()` is
 * what makes the silent refresh in `auth.ts`'s `jwt()` callback actually
 * survive past the one render that computed it, instead of being recomputed —
 * and raced — from scratch by whatever happens to ask next.
 *
 * This MUST cover `/api/graphql` and `/api/rest/*`: they are the most
 * frequent auth()-triggering calls of all (every read and every write), so
 * excluding them from the matcher would leave the exact two call sites most
 * likely to hit the access-token boundary still on the old, never-persisted
 * path. They carry their own JSON responses, so they skip next-intl/maintenance
 * entirely here — this wrapper only needs to run for the cookie persistence.
 */
export default auth((request: NextRequest) => {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  if (MAINTENANCE_MODE) {
    const locale = localeOf(pathname) ?? routing.defaultLocale;

    // The maintenance page itself must stay reachable, or the rewrite loops.
    if (pathname !== `/${locale}/maintenance`) {
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/maintenance`;
      // 503 tells crawlers and uptime checks this is temporary — a 200 here
      // would let a search engine cache the downtime page as the real site.
      return NextResponse.rewrite(url, { status: 503 });
    }
  }

  return handleI18n(request);
});

export const config = {
  matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
};
