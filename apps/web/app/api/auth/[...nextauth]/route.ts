import { handlers } from '@/auth';

/**
 * Auth.js route handlers. Deliberately OUTSIDE the [locale] segment: session
 * endpoints are not user-facing pages and must not be locale-prefixed. The
 * next-intl middleware matcher already excludes /api for the same reason.
 */
export const { GET, POST } = handlers;
