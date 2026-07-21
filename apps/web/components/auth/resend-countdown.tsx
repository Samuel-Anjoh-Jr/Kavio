'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/**
 * Resend control with a live countdown (ACC-04).
 *
 * The countdown is driven by the server's `resendAvailableAt` instant rather
 * than a local timer started on render: the cooldown is enforced server-side, so
 * a client-side clock would let a reload appear to reset it and then surprise
 * the user with a RESEND_TOO_SOON error.
 *
 * The remaining seconds are DERIVED during render from that instant and a
 * ticking clock, rather than mirrored into state — copying a prop into state
 * would leave the two able to disagree.
 */
export function ResendCountdown({
  availableAt,
  pending,
  onResend,
}: {
  availableAt: string | null;
  pending: boolean;
  onResend: () => void;
}) {
  const t = useTranslations('Auth.resend');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!availableAt) return;

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [availableAt]);

  const secondsLeft = remainingSeconds(availableAt, now);
  const waiting = secondsLeft > 0;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={waiting || pending}
      onClick={onResend}
      // Politely announced so the countdown does not chatter on every tick.
      aria-live="polite"
    >
      {waiting ? t('countdown', { seconds: secondsLeft }) : t('available')}
    </Button>
  );
}

function remainingSeconds(availableAt: string | null, now: number): number {
  if (!availableAt) return 0;
  const diff = new Date(availableAt).getTime() - now;
  return diff > 0 ? Math.ceil(diff / 1000) : 0;
}
