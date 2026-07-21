'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * Form-level success / error banner. Every mutating form gets one (engineering
 * standard), so an outcome is always stated rather than inferred from the page
 * quietly not changing.
 */
export function FormBanner({
  tone,
  message,
  requestId,
}: {
  tone: 'success' | 'error';
  message: string;
  requestId?: string;
}) {
  const t = useTranslations('FormError');

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col gap-1 rounded-card border px-4 py-3 text-sm',
        tone === 'error'
          ? 'border-danger/20 bg-danger/10 text-danger'
          : 'border-success/20 bg-success/10 text-success',
      )}
    >
      <p>{message}</p>
      {/* The requestId is what support traces in the structured logs (SRS §19). */}
      {requestId && <p className="font-mono text-xs opacity-70">{t('reference', { requestId })}</p>}
    </div>
  );
}
