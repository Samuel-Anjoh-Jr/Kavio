'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { BellRing, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { RequireAuthNotice } from '@/components/messaging/require-auth-notice';
import {
  NOTIFICATION_SOUND_KEYS,
  PREFERENCE_CATEGORIES,
  PREFERENCE_CHANNELS,
  setNotificationPreference,
  setNotificationSoundPreference,
  type NotificationSoundKey,
} from '@/lib/notifications';
import { playNotificationSound } from '@/lib/notification-sound';
import { disableWebPush, enableWebPush, pushPermission, pushSupport } from '@/lib/web-push';
import {
  NOTIFICATION_SETTINGS_QUERY,
  type NotificationSettingsQueryResult,
  type NotificationChannel,
  type NotificationCategory,
} from '@/lib/graphql/notifications';
import { cn } from '@/lib/utils';

/**
 * Per-channel notification preferences (NOT-02, SET-02).
 *
 * A channel × category grid: the user decides which kinds of update reach them on
 * which channel. SMS is shown but disabled with a "coming soon" tag — it is wired
 * end to end and flips on with a server flag, so the column is present rather than
 * hidden, which is the honest way to defer it. Security notices are deliberately
 * absent from the grid: they always go by email and cannot be muted (SRS §17).
 *
 * Web push additionally needs a browser opt-in, so its column carries an enable
 * control that raises the permission prompt only after the value is explained.
 */
export function NotificationPreferencesScreen() {
  const t = useTranslations('Notifications');
  const { toast } = useToast();
  const { status } = useSession();

  const { data, loading, refetch } = useQuery<NotificationSettingsQueryResult>(
    NOTIFICATION_SETTINGS_QUERY,
    { fetchPolicy: 'cache-and-network', errorPolicy: 'all', skip: status !== 'authenticated' },
  );

  // Local optimistic mirror of the grid, keyed "channel:category".
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const settings = data?.myNotificationSettings;

  const channelAvailable = useCallback(
    (channel: NotificationChannel) =>
      settings?.channels.find((c) => c.channel === channel)?.available ?? false,
    [settings],
  );

  const isEnabled = useCallback(
    (channel: NotificationChannel, category: NotificationCategory): boolean => {
      const key = `${channel}:${category}`;
      const override = overrides[key];
      if (override !== undefined) return override;
      const row = settings?.preferences.find(
        (p) => p.channel === channel && p.category === category,
      );
      // A missing row is treated as enabled (the API's opt-out model).
      return row?.enabled ?? true;
    },
    [overrides, settings],
  );

  const toggle = useCallback(
    async (channel: NotificationChannel, category: NotificationCategory) => {
      const key = `${channel}:${category}`;
      const next = !isEnabled(channel, category);
      setOverrides((prev) => ({ ...prev, [key]: next }));
      setPending((prev) => new Set(prev).add(key));
      try {
        await setNotificationPreference({ channel, category, enabled: next });
      } catch {
        // Revert the optimistic change on failure.
        setOverrides((prev) => ({ ...prev, [key]: !next }));
        toast({ variant: 'danger', title: t('settings.saveFailed') });
      } finally {
        setPending((prev) => {
          const copy = new Set(prev);
          copy.delete(key);
          return copy;
        });
      }
    },
    [isEnabled, t, toast],
  );

  if (status === 'unauthenticated') {
    return <RequireAuthNotice titleKey="auth.title" bodyKey="auth.body" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {t('settings.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      <PushOptIn subscribed={settings?.pushSubscribed ?? false} onChanged={() => void refetch()} />

      {loading && !settings ? (
        <Skeleton className="h-64 w-full rounded-card" />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="p-3 text-left font-medium text-foreground">{t('settings.title')}</th>
                {PREFERENCE_CHANNELS.map((channel) => (
                  <th key={channel} className="p-3 text-center font-medium text-foreground">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{t(`settings.channel.${channel}`)}</span>
                      {!channelAvailable(channel) && (
                        <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                          {t('settings.comingSoon')}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PREFERENCE_CATEGORIES.map((category) => (
                <tr key={category} className="border-b border-border last:border-0">
                  <td className="p-3 text-foreground">{t(`settings.category.${category}`)}</td>
                  {PREFERENCE_CHANNELS.map((channel) => {
                    const available = channelAvailable(channel);
                    const key = `${channel}:${category}`;
                    const enabled = isEnabled(channel, category);
                    return (
                      <td key={channel} className="p-3 text-center">
                        <Toggle
                          checked={enabled && available}
                          disabled={!available || pending.has(key)}
                          onChange={() => void toggle(channel, category)}
                          label={`${t(`settings.channel.${channel}`)} – ${t(`settings.category.${category}`)}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('settings.securityNote')}</p>

      <SoundPreferences
        soundPreferences={settings?.soundPreferences ?? []}
        onChanged={() => void refetch()}
      />
    </div>
  );
}

/**
 * Per-category custom sound (NOT-02). Only ever plays while TrustPro is open
 * in a tab — no browser lets a site choose the sound for a BACKGROUND push
 * notification, so a category left unset (or set to "Default") just gets
 * whatever the device already plays for every other notification.
 */
function SoundPreferences({
  soundPreferences,
  onChanged,
}: {
  soundPreferences: Array<{ category: NotificationCategory; soundKey: string }>;
  onChanged: () => void;
}) {
  const t = useTranslations('Notifications');
  const { toast } = useToast();
  const [pending, setPending] = useState<Set<NotificationCategory>>(new Set());
  const [overrides, setOverrides] = useState<
    Partial<Record<NotificationCategory, NotificationSoundKey>>
  >({});

  const soundFor = (category: NotificationCategory): NotificationSoundKey => {
    const override = overrides[category];
    if (override) return override;
    const row = soundPreferences.find((p) => p.category === category);
    return (row?.soundKey as NotificationSoundKey) ?? 'default';
  };

  async function onSelect(category: NotificationCategory, soundKey: NotificationSoundKey) {
    setOverrides((prev) => ({ ...prev, [category]: soundKey }));
    setPending((prev) => new Set(prev).add(category));
    playNotificationSound(soundKey);
    try {
      await setNotificationSoundPreference({ category, soundKey });
      onChanged();
    } catch {
      toast({ variant: 'danger', title: t('settings.saveFailed') });
    } finally {
      setPending((prev) => {
        const copy = new Set(prev);
        copy.delete(category);
        return copy;
      });
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{t('settings.sound.title')}</p>
        <p className="text-sm text-muted-foreground">{t('settings.sound.body')}</p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {PREFERENCE_CATEGORIES.map((category) => (
          <li key={category} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm text-foreground">{t(`settings.category.${category}`)}</span>
            <select
              value={soundFor(category)}
              disabled={pending.has(category)}
              onChange={(event) =>
                void onSelect(category, event.target.value as NotificationSoundKey)
              }
              className="rounded-button border border-input bg-background px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
              aria-label={`${t('settings.sound.title')} – ${t(`settings.category.${category}`)}`}
            >
              {NOTIFICATION_SOUND_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`settings.sound.options.${key}`)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t('settings.sound.note')}</p>
    </div>
  );
}

/** The web-push browser opt-in (PROMPT 77). Explains value before the prompt. */
function PushOptIn({ subscribed, onChanged }: { subscribed: boolean; onChanged: () => void }) {
  const t = useTranslations('Notifications');
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  // Browser capability and permission are EXTERNAL state, not React state, so
  // they are read through useSyncExternalStore rather than copied into state in
  // an effect. The server snapshot ("supported" / "default") keeps hydration
  // stable, and because both snapshots are primitives React can re-read them on
  // every render without the identity churn that would loop on an object.
  const support = useSyncExternalStore(subscribeBrowserOnly, pushSupport, () => 'supported');
  const permission = useSyncExternalStore(subscribeBrowserOnly, pushPermission, () => 'default');

  const enable = async () => {
    setBusy(true);
    try {
      const result = await enableWebPush(navigator.userAgent.slice(0, 80));
      if (result.ok) {
        toast({ title: t('settings.push.enabled') });
        // No local permission state to update: onChanged() refetches the
        // settings query, and the re-render re-reads the browser's own answer.
        onChanged();
      } else {
        toast({ variant: 'danger', title: t(`settings.push.${result.reason}`) });
      }
    } catch {
      toast({ variant: 'danger', title: t('settings.push.enableFailed') });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await disableWebPush();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <BellRing aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{t('settings.push.title')}</p>
        <p className="text-sm text-muted-foreground">
          {support === 'unsupported'
            ? t('settings.push.unsupported')
            : permission === 'denied'
              ? t('settings.push.denied')
              : t('settings.push.body')}
        </p>
      </div>
      {support === 'supported' && permission !== 'denied' && (
        <Button
          size="sm"
          variant={subscribed ? 'outline' : 'primary'}
          onClick={() => (subscribed ? void disable() : void enable())}
          disabled={busy}
          className="shrink-0 gap-1.5"
        >
          {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {subscribed ? t('settings.push.disable') : t('settings.push.enable')}
        </Button>
      )}
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/**
 * Subscribe function for the push capability/permission snapshots.
 *
 * The browser fires no event when Notification.permission changes, so there is
 * nothing to subscribe to: the value is re-read on each render instead, and the
 * explicit enable/disable flows refetch and re-render on their own. Returning a
 * no-op unsubscribe is the honest expression of "this source never notifies".
 */
function subscribeBrowserOnly(): () => void {
  return () => {};
}
