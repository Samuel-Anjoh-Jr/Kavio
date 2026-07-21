'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FALLBACK_VIEWPORT, formatDistance, roundCoordinate } from '@/lib/geo';
import { NEARBY_LANDMARKS_QUERY, type NearbyLandmarksQueryResult } from '@/lib/graphql/discovery';
import { hasMapToken, type MapViewport } from './map-canvas';

/**
 * Drop or adjust a pin (DIS-09).
 *
 * Two things make this work the way people here actually give directions.
 *
 * THE PIN IS THE MAP CENTRE, not a marker you tap. On a phone, tapping to place
 * a marker means your thumb covers the exact spot you are aiming at; moving the
 * map under a fixed crosshair does not, and it is what every mapping app on the
 * device already taught the user.
 *
 * LANDMARKS ARE FIRST-CLASS. "Carrefour Ndokotti, behind the pharmacy" is how an
 * address is given in Douala, and the OSM landmarks near the pin are offered as
 * taps — which is also the whole picker when no map can render.
 */

const MapCanvas = dynamic(() => import('./map-canvas'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-image" />,
});

export interface PinPickerProps {
  initial: { latitude: number; longitude: number } | null;
  onConfirm: (pin: { latitude: number; longitude: number; landmark: string | null }) => void;
  /** Rendered under the picker — the confirm control lives with the caller's form. */
  confirmLabel: string;
  busy?: boolean;
}

export function PinPicker({ initial, onConfirm, confirmLabel, busy = false }: PinPickerProps) {
  const t = useTranslations('Location');

  const [pin, setPin] = useState({
    latitude: initial?.latitude ?? FALLBACK_VIEWPORT.latitude,
    longitude: initial?.longitude ?? FALLBACK_VIEWPORT.longitude,
  });
  const [landmark, setLandmark] = useState<string | null>(null);

  // Follow a location chosen elsewhere in the drawer (e.g. the user tapped "use
  // my current location" first, then opened the map to nudge it). Adjusted
  // during render rather than from an effect, so the crosshair never paints one
  // frame at the old position.
  const initialKey = initial ? `${initial.latitude},${initial.longitude}` : null;
  const [lastInitialKey, setLastInitialKey] = useState(initialKey);

  if (initialKey !== lastInitialKey) {
    setLastInitialKey(initialKey);
    if (initial) setPin({ latitude: initial.latitude, longitude: initial.longitude });
  }

  const { data, loading } = useQuery<NearbyLandmarksQueryResult>(NEARBY_LANDMARKS_QUERY, {
    variables: { latitude: pin.latitude, longitude: pin.longitude, radiusM: 800, limit: 6 },
    // The pin moves continuously while panning; a cached answer for a nearby
    // point is a better trade than a request per frame.
    fetchPolicy: 'cache-first',
  });

  const landmarks = data?.nearbyLandmarks ?? [];
  const mapAvailable = hasMapToken();

  function onViewportChange(viewport: MapViewport) {
    setPin({ latitude: viewport.latitude, longitude: viewport.longitude });
    // The pin moved, so a landmark chosen for the old position no longer
    // describes it. Silently keeping it would attach the wrong note.
    setLandmark(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {mapAvailable ? (
        <div className="relative h-64 w-full sm:h-80">
          <MapCanvas
            label={t('mapLabel')}
            center={initial}
            zoom={15}
            onViewportChange={onViewportChange}
          />

          {/* The crosshair marks the map centre, which IS the pin. Pointer
              events off so it never intercepts a drag. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center pb-6"
          >
            <MapPin className="size-9 fill-primary/20 text-primary drop-shadow" />
          </div>
        </div>
      ) : (
        // No Mapbox token: say so plainly and keep the picker usable through
        // landmarks rather than showing a blank grey box that looks broken.
        <p className="rounded-card border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          {t('mapUnavailable')}
        </p>
      )}

      <div>
        <h3 className="text-sm font-medium text-foreground">{t('landmarkHeading')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('landmarkHint')}</p>

        {loading && landmarks.length === 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Skeleton className="h-9 w-32 rounded-button" />
            <Skeleton className="h-9 w-40 rounded-button" />
          </div>
        ) : landmarks.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('landmarkEmpty')}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {landmarks.map((entry) => {
              const selected = landmark === entry.name;
              const distance = formatDistance(entry.distanceM, (key, values) =>
                t(`distance.${key}`, values),
              );

              return (
                <li key={entry.osmId}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      // Choosing a landmark also moves the pin onto it: the user
                      // is naming a place, not annotating a coordinate.
                      setPin({ latitude: entry.latitude, longitude: entry.longitude });
                      setLandmark(selected ? null : entry.name);
                    }}
                    className={
                      selected
                        ? 'rounded-button border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-primary'
                        : 'rounded-button border border-input bg-surface px-3 py-2 text-sm text-surface-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    }
                  >
                    {entry.name}
                    {distance && (
                      <span className="ml-2 font-numeric text-xs text-muted-foreground">
                        {distance}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="font-numeric text-xs text-muted-foreground">
        {t('coordinates', {
          latitude: roundCoordinate(pin.latitude).toFixed(4),
          longitude: roundCoordinate(pin.longitude).toFixed(4),
        })}
      </p>

      <Button
        type="button"
        disabled={busy}
        onClick={() => onConfirm({ ...pin, landmark })}
        className="w-full"
      >
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : <MapPin aria-hidden />}
        {confirmLabel}
      </Button>
    </div>
  );
}
