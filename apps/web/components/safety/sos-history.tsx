'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, MapPin, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/use-toast';
import { formatDateTime } from '@/lib/datetime';
import { ApiError } from '@/lib/api-error';
import { resolveSos, SOS_STATUS_TONE } from '@/lib/safety';
import { SOS_HISTORY_QUERY, type SosHistoryQueryResult, type SOSAlert } from '@/lib/graphql/safety';

/**
 * SOS history (SOS-02, SOS-03): every alert with who it reached and how it was
 * resolved. An active alert can be resolved or marked a false alarm from here —
 * the auditable close-out that keeps the record honest.
 */
export function SosHistory() {
  const t = useTranslations('Safety');
  const { data, loading, refetch } = useQuery<SosHistoryQueryResult>(SOS_HISTORY_QUERY, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const alerts = data?.mySosAlerts ?? [];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold text-foreground">{t('history.title')}</h2>

      {loading && alerts.length === 0 ? (
        <Skeleton className="h-24 w-full rounded-card" />
      ) : alerts.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('history.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onChanged={() => void refetch()} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AlertCard({ alert, onChanged }: { alert: SOSAlert; onChanged: () => void }) {
  const t = useTranslations('Safety');
  const locale = useLocale();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const resolve = async (status: 'RESOLVED' | 'FALSE_ALARM') => {
    setBusy(true);
    try {
      await resolveSos(alert.id, status);
      toast({ title: t('sos.resolved') });
      onChanged();
    } catch (error) {
      toast({
        variant: 'danger',
        title: t('sos.failed'),
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const deliveredShares = alert.shares.filter((share) => share.delivered).length;

  return (
    <li className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
            alert.status === 'ACTIVE'
              ? 'bg-danger/10 text-danger'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <ShieldAlert aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              tone={SOS_STATUS_TONE[alert.status]}
              size="sm"
              label={t(`history.status.${alert.status}`)}
            />
            <span className="font-numeric text-xs text-muted-foreground">
              {t('history.openedOn', { date: formatDateTime(alert.createdAt, locale) ?? '' })}
            </span>
          </div>
          {alert.message && <p className="mt-1 text-sm text-foreground">{alert.message}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {t('history.sharedWith', { count: alert.shares.length })}
            {alert.shares.length > 0 &&
              ` · ${deliveredShares}/${alert.shares.length} ${t('history.delivered')}`}
          </p>

          {alert.latitude !== null && alert.longitude !== null && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${alert.latitude}&mlon=${alert.longitude}#map=17/${alert.latitude}/${alert.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <MapPin aria-hidden className="size-4" />
              {t('history.viewMap')}
            </a>
          )}

          {alert.status === 'ACTIVE' && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => void resolve('RESOLVED')}
                disabled={busy}
                className="gap-1.5"
              >
                <CheckCircle2 aria-hidden className="size-4" />
                {t('sos.resolve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void resolve('FALSE_ALARM')}
                disabled={busy}
              >
                {t('sos.falseAlarm')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
