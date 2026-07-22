'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useRequireAuth } from '@/components/auth/require-auth';
import { ApiError } from '@/lib/api-error';
import { readCurrentPosition, triggerSos, SOS_HOLD_MS } from '@/lib/safety';
import { cn } from '@/lib/utils';

/**
 * The press-and-hold SOS control (SOS-01).
 *
 * Press-and-hold, not a tap: an emergency alert that a pocket brush can raise is
 * an alert nobody trusts. The hold is short (SOS_HOLD_MS) and its progress is
 * drawn as a filling ring, so the wait is legible rather than feeling like a dead
 * button. Releasing early cancels cleanly.
 *
 * It reads the current position first but never blocks on it — an alert with no
 * coordinates still goes out, because a refused location permission must not be
 * what stops someone getting help.
 */
export function SosButton({
  jobId,
  bookingId,
  size = 'lg',
  onTriggered,
}: {
  jobId?: string;
  bookingId?: string;
  size?: 'lg' | 'sm';
  onTriggered?: () => void;
}) {
  const t = useTranslations('Safety');
  const { toast } = useToast();
  const requireAuth = useRequireAuth();

  const [phase, setPhase] = useState<'idle' | 'holding' | 'sending'>('idle');
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(0);
  const firedRef = useRef(false);

  const clearHold = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => clearHold, [clearHold]);

  const fire = useCallback(async () => {
    firedRef.current = true;
    setPhase('sending');
    clearHold();

    try {
      // Best-effort position; the alert goes out regardless (see readCurrentPosition).
      const position = await readCurrentPosition();
      await triggerSos({
        ...(position ?? {}),
        ...(jobId ? { jobId } : {}),
        ...(bookingId ? { bookingId } : {}),
      });
      toast({ title: t('sos.sent'), description: t('sos.helpOnWay') });
      onTriggered?.();
    } catch (error) {
      toast({
        variant: 'danger',
        title: t('sos.failed'),
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setPhase('idle');
      setProgress(0);
      firedRef.current = false;
    }
  }, [bookingId, clearHold, jobId, onTriggered, t, toast]);

  const startHold = useCallback(() => {
    // Gate the ACTION (SOS is state-changing): a guest is sent to login first.
    if (!requireAuth('report_content')) return;
    if (phase !== 'idle') return;

    firedRef.current = false;
    startedRef.current = Date.now();
    setPhase('holding');

    const tick = () => {
      const elapsed = Date.now() - startedRef.current;
      const ratio = Math.min(1, elapsed / SOS_HOLD_MS);
      setProgress(ratio);
      if (ratio >= 1) {
        if (!firedRef.current) void fire();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [fire, phase, requireAuth]);

  const cancelHold = useCallback(() => {
    if (phase === 'holding') {
      clearHold();
      setPhase('idle');
      setProgress(0);
    }
  }, [clearHold, phase]);

  const dimension = size === 'lg' ? 168 : 56;
  const stroke = size === 'lg' ? 6 : 4;
  const radius = dimension / 2 - stroke;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        // A keyboard user cannot press-and-hold; space/enter fire directly, with
        // the same login gate. Accessibility beats the anti-mistap ritual here.
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && phase === 'idle') {
            event.preventDefault();
            if (requireAuth('report_content')) void fire();
          }
        }}
        disabled={phase === 'sending'}
        aria-label={t('sos.hold')}
        className={cn(
          'relative flex touch-none items-center justify-center rounded-full bg-danger text-danger-foreground shadow-lg transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/40 active:scale-95',
          phase === 'holding' && 'scale-95',
        )}
        style={{ width: dimension, height: dimension }}
      >
        {/* Progress ring drawn over the button while holding. */}
        <svg
          className="pointer-events-none absolute inset-0 -rotate-90"
          width={dimension}
          height={dimension}
          aria-hidden
        >
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.25}
            strokeWidth={stroke}
          />
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            stroke="white"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
        </svg>
        <span className="flex flex-col items-center gap-1">
          <ShieldAlert aria-hidden className={size === 'lg' ? 'size-10' : 'size-5'} />
          {size === 'lg' && (
            <span className="text-sm font-semibold">
              {phase === 'sending'
                ? t('sos.sending')
                : phase === 'holding'
                  ? t('sos.holding')
                  : 'SOS'}
            </span>
          )}
        </span>
      </button>
      {size === 'lg' && (
        <p className="max-w-xs text-center text-sm text-muted-foreground">{t('sos.instruction')}</p>
      )}
    </div>
  );
}
