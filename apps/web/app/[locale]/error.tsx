'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createLogger } from '@/lib/logger';

const logger = createLogger('error-boundary');

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('ErrorBoundary');

  useEffect(() => {
    logger.error('Route error boundary triggered', {
      payload: { digest: error.digest },
      error,
    });
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t('heading')}</h2>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">{t('description')}</p>
      {error.digest && (
        <p className="rounded-md bg-zinc-100 px-3 py-1.5 font-mono text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          {t('reference', { digest: error.digest })}
        </p>
      )}
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-full bg-indigo-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700"
      >
        {t('retry')}
      </button>
    </div>
  );
}
