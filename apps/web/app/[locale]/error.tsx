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
      <h2 className="font-heading text-xl font-semibold text-foreground">{t('heading')}</h2>
      <p className="max-w-md text-muted-foreground">{t('description')}</p>
      {error.digest && (
        <p className="rounded-input bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
          {t('reference', { digest: error.digest })}
        </p>
      )}
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-button bg-primary px-6 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {t('retry')}
      </button>
    </div>
  );
}
