import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
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

export default function proxy(request: NextRequest) {
  if (MAINTENANCE_MODE) {
    const { pathname } = request.nextUrl;
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
}

export const config = {
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
};
