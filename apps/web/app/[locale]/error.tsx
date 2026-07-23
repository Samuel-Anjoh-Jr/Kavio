'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SystemState } from '@/components/system/system-state';
import { createLogger } from '@/lib/logger';

const logger = createLogger('error-boundary');

/**
 * The 500 state for anything under a locale (SYS-04).
 *
 * Routes through the shared SystemState shell so it is visually one family with
 * the 404, offline and empty screens rather than a bespoke layout — the whole
 * point of centralising the states. The digest is surfaced as a `reference` a
 * user can read to support (SRS §19 requestId contract).
 */
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
    <SystemState
      tone="danger"
      icon={<AlertTriangle aria-hidden="true" />}
      title={t('heading')}
      description={t('description')}
      reference={error.digest ? t('reference', { digest: error.digest }) : undefined}
      action={
        <Button variant="primary" onClick={() => reset()}>
          {t('retry')}
        </Button>
      }
    />
  );
}
