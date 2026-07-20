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
      className="flex flex-col gap-1 rounded-card border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger"
    >
      <p>{message}</p>
      {requestId && (
        <p className="font-mono text-xs text-danger/70">{t('reference', { requestId })}</p>
      )}
    </div>
  );
}
