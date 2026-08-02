'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { useGeolocation, type GeolocationErrorCode } from '@/components/discovery/use-geolocation';
import { readStoredLocation } from '@/lib/geo';
import type { LocationValue } from '@/lib/onboarding';

/**
 * Location capture for onboarding (ACC-10).
 *
 * Two paths: a one-tap device fix, and typed city/area. Typing ALWAYS wins — the
 * moment the user edits a field the source flips to HUMAN_INPUT, because a human
 * statement outranks an auto-detected fix (CLAUDE.md SPATIAL). The map-pin mode
 * and reverse-geocoding arrive with the Location Setter in PROMPT 42; this
 * captures the same value shape so that swap needs no data migration.
 *
 * The device fix goes through the shared `useGeolocation` hook rather than a
 * second hand-rolled call: that hook deliberately asks for a coarse,
 * network-based fix (`enableHighAccuracy: false`) because a high-accuracy GPS
 * lock can genuinely take longer than any reasonable timeout indoors or on a
 * mid-range phone — asking for one here was timing out constantly for exactly
 * that reason.
 */
function toErrorKey(code: GeolocationErrorCode): 'unsupported' | 'denied' | 'failed' {
  if (code === 'unsupported') return 'unsupported';
  if (code === 'permissionDenied') return 'denied';
  return 'failed';
}

export function LocationFields({
  value,
  onChange,
}: {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
}) {
  const t = useTranslations('Onboarding.location');
  const { status, error, locate } = useGeolocation();
  const locating = status === 'locating';

  // Written after commit, read once on mount below — see the effect for why.
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  // A guest who already tapped "use my current location" while browsing has a
  // fix sitting in localStorage (see lib/geo.ts). Making them press the same
  // button again the moment they sign up — and hope the GPS radio cooperates a
  // second time — would repeat work they already did. This only ever fills a
  // step that is genuinely untouched (no coordinate saved yet) and is still
  // fully editable afterwards, same as a fresh device fix.
  useEffect(() => {
    const { value: current, onChange: apply } = latest.current;
    if (current.latitude !== undefined || current.longitude !== undefined) return;

    const stored = readStoredLocation();
    if (!stored) return;

    apply({
      ...current,
      latitude: stored.latitude,
      longitude: stored.longitude,
      source: 'DEVICE_GPS',
    });
    // Runs once: this seeds an untouched step from the guest's prior fix, it is
    // not meant to re-fire as `value`/`onChange` identities change on every render.
  }, []);

  async function requestCurrentLocation() {
    const fix = await locate();
    if (!fix) return;

    onChange({
      ...value,
      latitude: fix.latitude,
      longitude: fix.longitude,
      source: 'DEVICE_GPS',
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void requestCurrentLocation()}
          disabled={locating}
        >
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

        {error && (
          <p role="alert" className="text-xs text-warning">
            {t(toErrorKey(error))}
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
