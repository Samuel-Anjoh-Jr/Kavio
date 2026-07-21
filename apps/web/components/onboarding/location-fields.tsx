'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import type { LocationValue } from '@/lib/onboarding';

/**
 * Location capture for onboarding (ACC-10).
 *
 * Two paths: a one-tap device fix, and typed city/area. Typing ALWAYS wins — the
 * moment the user edits a field the source flips to HUMAN_INPUT, because a human
 * statement outranks an auto-detected fix (CLAUDE.md SPATIAL). The map-pin mode
 * and reverse-geocoding arrive with the Location Setter in PROMPT 42; this
 * captures the same value shape so that swap needs no data migration.
 */
export function LocationFields({
  value,
  onChange,
}: {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
}) {
  const t = useTranslations('Onboarding.location');
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  function useCurrentLocation() {
    if (!('geolocation' in navigator)) {
      setGeoError(t('unsupported'));
      return;
    }

    setLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          ...value,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: 'DEVICE_GPS',
        });
        setLocating(false);
      },
      (error) => {
        // Permission denial is the common case and is not an error state worth
        // alarming anyone about — the typed fields still work.
        setGeoError(error.code === error.PERMISSION_DENIED ? t('denied') : t('failed'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={useCurrentLocation} disabled={locating}>
          {locating ? <Loader2 aria-hidden className="animate-spin" /> : <MapPin aria-hidden />}
          {locating ? t('locating') : t('useCurrent')}
        </Button>

        {value.latitude !== undefined && value.longitude !== undefined && (
          <p className="text-xs text-muted-foreground">
            {t('captured', {
              lat: value.latitude.toFixed(4),
              lng: value.longitude.toFixed(4),
            })}
          </p>
        )}

        {geoError && (
          <p role="alert" className="text-xs text-warning">
            {geoError}
          </p>
        )}
      </div>

      <Field
        label={t('cityLabel')}
        value={value.city}
        placeholder={t('cityPlaceholder')}
        onChange={(event) =>
          onChange({ ...value, city: event.target.value, source: 'HUMAN_INPUT' })
        }
      />

      <Field
        label={t('areaLabel')}
        value={value.area ?? ''}
        placeholder={t('areaPlaceholder')}
        hint={t('areaHint')}
        onChange={(event) =>
          onChange({ ...value, area: event.target.value, source: 'HUMAN_INPUT' })
        }
      />
    </div>
  );
}
