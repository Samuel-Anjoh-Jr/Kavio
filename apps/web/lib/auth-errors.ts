'use client';

import { useTranslations } from 'next-intl';
import { ApiError } from './api-error';

/**
 * Turns an API/Auth.js error CODE into a localized message (NFR-I18N-01).
 *
 * The API's own English message is deliberately discarded: only the code
 * crosses the boundary, so a French user never sees an English string leak
 * through from the server.
 */
export function useAuthErrorMessage() {
  const t = useTranslations('Auth.errors');

  return (error: unknown, values?: Record<string, string | number>): string => {
    const code =
      error instanceof ApiError
        ? error.code
        : typeof error === 'string'
          ? error
          : error instanceof Error && error.name !== 'Error'
            ? error.name
            : 'UNKNOWN_ERROR';

    return t.has(code) ? t(code, values) : t('UNKNOWN_ERROR');
  };
}
