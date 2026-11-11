'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { BellRing, BriefcaseBusiness, CalendarCheck, Volume2, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { restPost } from '@/lib/rest-api';
import { onNativeAlertOpened } from '@/lib/alerts/native-alerts';
import { startNativePush } from '@/lib/alerts/native-push';
import {
  onRingStop,
  playOnce,
  resumeRingAudio,
  startRing,
  stopRing,
} from '@/lib/alerts/ring-player';

/**
 * The in-app half of a Kavio "ring" (NOT-02, alerts v2).
 *
 * Push payloads reach the open app three ways — relayed by the service worker
 * (`kavio:notification-push`), from the native app's foreground listener
 * (`kavio:alert`), or as the native app opening from a ring — and all three
 * land here:
 *
 *   ring   → a full-screen sheet with the looping brand ringtone, vibration,
 *            a countdown ring and "View" / "Later" (worker: a client funded a
 *            booking, or invited them to a job).
 *   once   → one branded sound (money, quotes, messages).
 *   cancel → the ring was answered on another device: close the sheet.
 *
 * Viewing acknowledges the ring server-side, which stops the WhatsApp / SMS /
 * voice escalation ladder.
 */
export interface IncomingAlert {
  alertId?: string;
  event: string;
  tier: 'ring' | 'once' | 'silent' | 'cancel';
  title: string;
  body: string;
  sound: string;
  loopSeconds: number;
  vibration?: number[];
  vibrate?: boolean;
  path: string;
  tag: string;
}

type Raw = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** Normalises both payload shapes (web push JSON and flat FCM strings). */
export function alertFromPayload(raw: Raw | null | undefined): IncomingAlert | null {
  if (!raw || raw.kv !== '2') return null;
  const tier = ['ring', 'once', 'silent', 'cancel'].includes(String(raw.tier))
    ? (raw.tier as IncomingAlert['tier'])
    : 'once';
  const vibration = Array.isArray(raw.vibration)
    ? raw.vibration.map(Number)
    : typeof raw.vibration === 'string' && raw.vibration
      ? raw.vibration.split(',').map(Number)
      : undefined;
  return {
    alertId: str(raw.alertId),
    event: str(raw.event) ?? 'generic',
    tier,
    title: str(raw.title) ?? 'Kavio',
    body: str(raw.body) ?? '',
    sound: str(raw.sound) ?? 'generic_notification',
    loopSeconds: Number(raw.loopSeconds) || 30,
    vibration: vibration?.filter((n) => Number.isFinite(n)),
    vibrate: raw.vibrate !== '0' && raw.vibrate !== false,
    path: str(raw.path) ?? str(raw.url) ?? '/app/notifications',
    tag: str(raw.tag) ?? str(raw.alertId) ?? `alert-${Date.now()}`,
  };
}

const RECENT_MS = 60_000;

export function RingSheet() {
  const t = useTranslations('Alerts');
  const router = useRouter();
  const { status } = useSession();
  const [current, setCurrent] = useState<IncomingAlert | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const recent = useRef(new Map<string, number>());
  const dialogRef = useRef<HTMLDivElement>(null);

  // Inside the native app, register the FCM token once signed in.
  useEffect(() => {
    if (status === 'authenticated') void startNativePush();
  }, [status]);

  const close = useCallback((tag?: string) => {
    setCurrent((prev) => {
      if (!prev || (tag && prev.tag !== tag)) return prev;
      stopRing({ silentCallbacks: true });
      return null;
    });
  }, []);

  const present = useCallback(
    (alert: IncomingAlert) => {
      if (alert.tier === 'cancel') {
        close(alert.tag);
        return;
      }
      // The service worker and the native listener can both hand over the
      // same push; sound it once (a re-push of a ring rings again).
      const key = `${alert.tier}:${alert.tag}`;
      const seen = recent.current.get(key);
      if (seen && Date.now() - seen < RECENT_MS && alert.tier !== 'ring') return;
      recent.current.set(key, Date.now());
      if (alert.tier === 'silent') return;
      if (alert.tier === 'once') {
        playOnce(alert.sound, alert.vibrate === false ? undefined : alert.vibration);
        return;
      }
      setCurrent(alert);
      setEndsAt(Date.now() + Math.max(5, alert.loopSeconds) * 1000);
      void startRing({
        sound: alert.sound,
        loopSeconds: alert.loopSeconds,
        vibration: alert.vibration,
        vibrate: alert.vibrate,
        title: alert.title,
      }).then((started) => setAudioBlocked(!started));
    },
    [close],
  );

  useEffect(() => {
    const onPush = (event: Event) => {
      const alert = alertFromPayload((event as CustomEvent<Raw>).detail);
      if (alert) present(alert);
    };
    window.addEventListener('kavio:notification-push', onPush);
    window.addEventListener('kavio:alert', onPush);
    return () => {
      window.removeEventListener('kavio:notification-push', onPush);
      window.removeEventListener('kavio:alert', onPush);
    };
  }, [present]);

  useEffect(
    () =>
      onNativeAlertOpened((event) => {
        let data: Raw | null = null;
        try {
          data = event.data ? (JSON.parse(event.data) as Raw) : null;
        } catch {
          data = null;
        }
        const alert = alertFromPayload(data);
        if (event.action === 'fullscreen' && alert) {
          present(alert);
          return;
        }
        if (event.path) router.push(event.path);
      }),
    [present, router],
  );

  useEffect(() => onRingStop(() => setEndsAt(null)), []);

  useEffect(() => {
    if (!current) return;
    dialogRef.current?.focus();
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [current]);

  const ack = useCallback((alert: IncomingAlert, action: 'open' | 'decline') => {
    if (!alert.alertId) return;
    // The ladder also stops when the booking moves on; a failed ack is not fatal.
    void restPost(`alerts/${encodeURIComponent(alert.alertId)}/ack/session`, { action }).catch(
      () => undefined,
    );
  }, []);

  const view = useCallback(() => {
    if (!current) return;
    ack(current, 'open');
    stopRing({ silentCallbacks: true });
    const path = current.path;
    setCurrent(null);
    router.push(path);
  }, [ack, current, router]);

  const later = useCallback(() => {
    if (!current) return;
    ack(current, 'decline');
    stopRing({ silentCallbacks: true });
    setCurrent(null);
  }, [ack, current]);

  if (!current) return null;

  const isJob = current.event === 'job.invitation_received';
  const secondsLeft = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;
  const ratio =
    secondsLeft !== null ? Math.min(1, secondsLeft / Math.max(1, current.loopSeconds)) : 0;
  const circumference = 2 * Math.PI * 35;
  const Icon = isJob ? BriefcaseBusiness : CalendarCheck;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="kavio-ring-title"
        aria-describedby="kavio-ring-body"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') later();
        }}
        className="w-full max-w-md rounded-t-card bg-surface p-6 pb-8 text-surface-foreground shadow-2xl outline-none sm:rounded-card"
      >
        <div className="mb-5 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <BellRing className="size-4 motion-safe:animate-pulse" aria-hidden />
            {isJob ? t('jobInvitation') : t('bookingFunded')}
          </span>
          <button
            type="button"
            onClick={later}
            aria-label={t('later')}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex items-start gap-4">
          <div className="relative size-20 shrink-0">
            <svg viewBox="0 0 80 80" className="size-20 -rotate-90" aria-hidden>
              <circle cx="40" cy="40" r="35" className="fill-none stroke-muted" strokeWidth="6" />
              <circle
                cx="40"
                cy="40"
                r="35"
                className="fill-none stroke-primary motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - ratio)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Icon className="size-6 text-primary" aria-hidden />
              {secondsLeft !== null ? (
                <span className="mt-0.5 font-numeric text-xs font-semibold tabular-nums">
                  {t('secondsShort', { seconds: secondsLeft })}
                </span>
              ) : null}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="kavio-ring-title" className="font-heading text-xl font-bold leading-tight">
              {current.title}
            </h2>
            <p id="kavio-ring-body" className="mt-1 text-sm text-muted-foreground">
              {current.body}
            </p>
          </div>
        </div>

        {audioBlocked ? (
          <button
            type="button"
            onClick={() => void resumeRingAudio().then((ok) => setAudioBlocked(!ok))}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-input border border-dashed border-primary/40 px-4 py-3 text-sm font-medium text-primary"
          >
            <Volume2 className="size-4" aria-hidden />
            {t('tapForSound')}
          </button>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" onClick={later}>
            {t('later')}
          </Button>
          <Button variant="primary" size="lg" onClick={view}>
            {isJob ? t('viewJob') : t('viewBooking')}
          </Button>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">{t('escalationHint')}</p>
      </div>
    </div>
  );
}
