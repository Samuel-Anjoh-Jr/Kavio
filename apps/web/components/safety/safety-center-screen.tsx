'use client';

import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { RequireAuthNotice } from '@/components/messaging/require-auth-notice';
import { ACTIVE_SOS_QUERY, type ActiveSosQueryResult } from '@/lib/graphql/safety';
import { SosButton } from './sos-button';
import { EmergencyContacts } from './emergency-contacts';
import { SosHistory } from './sos-history';

/**
 * The Safety Center (SOS-01, SOS-02, SOS-03): the SOS control, the persistent
 * "SOS active" banner, emergency contacts, and the SOS history — one screen a
 * frightened user can reach in a couple of taps and understand at a glance.
 */
export function SafetyCenterScreen() {
  const t = useTranslations('Safety');
  const { status } = useSession();

  const { data, refetch } = useQuery<ActiveSosQueryResult>(ACTIVE_SOS_QUERY, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    skip: status !== 'authenticated',
  });

  if (status === 'unauthenticated') {
    return <RequireAuthNotice titleKey="auth.title" bodyKey="auth.body" />;
  }

  const active = data?.activeSosAlert ?? null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {active && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-card border border-danger/30 bg-danger/10 p-4 text-danger"
        >
          <ShieldAlert aria-hidden className="size-5 shrink-0" />
          <p className="text-sm font-medium">{t('sos.activeBanner')}</p>
        </div>
      )}

      <div className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface p-8">
        <SosButton onTriggered={() => void refetch()} />
      </div>

      <EmergencyContacts />
      <SosHistory />
    </div>
  );
}
