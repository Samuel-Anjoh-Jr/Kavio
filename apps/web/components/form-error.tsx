'use client';

import { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api-error';

/**
 * Inline error feedback for mutating forms (REST writes): shows the server's
 * message plus its requestId so users can reference it with support without
 * the failure being silent.
 */
export function FormError({ error }: { error: ApiError | string | null | undefined }) {
  const t = useTranslations('FormError');

  if (!error) {
    return null;
  }

  const message = typeof error === 'string' ? error : error.message;
  const requestId = typeof error === 'string' ? undefined : error.requestId;

  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
    >
      <p>{message}</p>
      {requestId && (
        <p className="font-mono text-xs text-red-500/80 dark:text-red-400/70">
          {t('reference', { requestId })}
        </p>
      )}
    </div>
  );
}
