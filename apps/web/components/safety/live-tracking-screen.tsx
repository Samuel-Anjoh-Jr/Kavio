'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import type { Map as MapboxMap, Marker } from 'mapbox-gl';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { hasMapToken } from '@/components/discovery/map-canvas';
import { RequireAuthNotice } from '@/components/messaging/require-auth-notice';
import { formatDistance, formatEta } from '@/lib/safety';
import {
  TRACKING_SESSION_QUERY,
  type TrackingSessionQueryResult,
  type LivePosition,
} from '@/lib/graphql/safety';
import { useTrackingViewer } from '@/lib/realtime/use-live-tracking';

const MapCanvas = dynamic(
  () => import('@/components/discovery/map-canvas').then((mod) => mod.MapCanvas),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

/**
 * The consented live-tracking map for an active job (SOS-03).
 *
 * The worker is the subject and consent-granter; this screen is the CLIENT's
 * view of them arriving. The initial position and ETA come from GraphQL (so the
 * screen is meaningful before the first socket tick), then the WebSocket stream
 * takes over and the marker moves with each ping.
 *
 * Mapbox is presentation only — the distance and ETA under the map are computed
 * server-side and arrive with each position, never measured here. If there is no
 * map token the panel alone is the feature: an ETA a client reads while waiting
 * does not need a rendered map to be useful.
 */
export function LiveTrackingScreen({ sessionId }: { sessionId: string }) {
  const t = useTranslations('Safety');
  const { data: session, status } = useSession();
  const token = session?.accessToken ?? null;

  const { data, loading } = useQuery<TrackingSessionQueryResult>(TRACKING_SESSION_QUERY, {
    variables: { id: sessionId },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    skip: status !== 'authenticated',
  });

  const live = useTrackingViewer(sessionId, token);

  const trackingSession = data?.trackingSession;

  // The live socket position wins once it arrives; the fetched last-known
  // position is the seed so the map is never empty on open.
  const position: LivePosition | null = useMemo(() => {
    if (live.position) {
      return {
        latitude: live.position.latitude,
        longitude: live.position.longitude,
        accuracy: live.position.accuracy,
        heading: live.position.heading,
        speed: live.position.speed,
        distanceMeters: live.position.travel?.distanceMeters ?? null,
        etaSeconds: live.position.travel?.etaSeconds ?? null,
        recordedAt: live.position.recordedAt,
      };
    }
    return trackingSession?.latestPosition ?? null;
  }, [live.position, trackingSession?.latestPosition]);

  if (status === 'unauthenticated') {
    return <RequireAuthNotice titleKey="auth.title" bodyKey="auth.body" />;
  }

  if (loading && !trackingSession) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <Skeleton className="h-80 w-full rounded-card" />
      </div>
    );
  }

  if (!trackingSession) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t('tracking.noSession')}</p>
        <Button asChild variant="outline">
          <Link href="/app/safety">{t('title')}</Link>
        </Button>
      </div>
    );
  }

  const ended = live.ended || trackingSession.status === 'ENDED';
  const revoked = trackingSession.consentRevoked;
  const eta = formatEta(position?.etaSeconds ?? null);
  const distance = formatDistance(position?.distanceMeters ?? null);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {t('tracking.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('tracking.subtitle')}</p>
      </div>

      {/* Status panel — the ETA is the point, so it leads. */}
      <div className="flex items-center gap-4 rounded-card border border-border bg-surface p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Navigation aria-hidden className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          {ended ? (
            <p className="text-sm font-medium text-foreground">{t('tracking.ended')}</p>
          ) : revoked ? (
            <p className="text-sm font-medium text-foreground">{t('tracking.consentRevoked')}</p>
          ) : position ? (
            <>
              <p className="font-heading text-lg font-semibold text-foreground">
                {eta ? t('tracking.eta', { eta }) : t('tracking.enRoute')}
              </p>
              {distance && (
                <p className="text-sm text-muted-foreground">
                  {t('tracking.distance', { distance })}
                </p>
              )}
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {t('tracking.waiting')}
            </p>
          )}
        </div>
        {live.connected && !ended && (
          <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-success" aria-hidden />
        )}
      </div>

      {/* Map, when a token is configured. */}
      {hasMapToken() ? (
        <div className="h-80 overflow-hidden rounded-card border border-border">
          <TrackingMap
            position={position}
            destination={
              trackingSession.destinationLat !== null && trackingSession.destinationLng !== null
                ? { lat: trackingSession.destinationLat, lng: trackingSession.destinationLng }
                : null
            }
          />
        </div>
      ) : (
        position && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${position.latitude}&mlon=${position.longitude}#map=16/${position.latitude}/${position.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-card border border-border bg-surface p-4 text-sm text-primary hover:bg-muted"
          >
            <MapPin aria-hidden className="size-4" />
            {t('history.viewMap')}
          </a>
        )
      )}
    </div>
  );
}

/**
 * The Mapbox layer for tracking: one marker that moves with each position, kept
 * out of the parent so a re-render never rebuilds the WebGL context.
 */
function TrackingMap({
  position,
  destination,
}: {
  position: LivePosition | null;
  destination: { lat: number; lng: number } | null;
}) {
  const t = useTranslations('Safety');
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);

  const onReady = useCallback((map: MapboxMap) => {
    mapRef.current = map;
  }, []);

  // Move (or create) the worker marker on each new position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;

    let cancelled = false;
    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled) return;
      const map2 = mapRef.current;
      if (!map2) return;

      if (!markerRef.current) {
        const el = document.createElement('div');
        el.className = 'tracking-marker';
        el.setAttribute('aria-label', t('tracking.enRoute'));
        markerRef.current = new mapboxgl.Marker({ color: '#3D5AFE' });
      }
      markerRef.current.setLngLat([position.longitude, position.latitude]).addTo(map2);

      if (destination && !destMarkerRef.current) {
        destMarkerRef.current = new mapboxgl.Marker({ color: '#14B86A' })
          .setLngLat([destination.lng, destination.lat])
          .addTo(map2);
      }

      map2.easeTo({ center: [position.longitude, position.latitude], duration: 800 });
    });

    return () => {
      cancelled = true;
    };
  }, [position, destination, t]);

  return (
    <MapCanvas
      label={t('tracking.title')}
      center={position ? { latitude: position.latitude, longitude: position.longitude } : null}
      zoom={15}
      interactive
      onReady={onReady}
      className="h-full w-full"
    />
  );
}
