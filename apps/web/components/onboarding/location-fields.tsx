'use client';

import { useEffect, useRef, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/auth/field';
import { useGeolocation, type GeolocationErrorCode } from '@/components/discovery/use-geolocation';
import { readStoredLocation } from '@/lib/geo';
import { REVERSE_GEOCODE_QUERY, type ReverseGeocodeQueryResult } from '@/lib/graphql/discovery';
import type { LocationValue } from '@/lib/onboarding';

/**
 * Location capture for onboarding (ACC-10).
 *
 * Two paths: a one-tap device fix, and typed city/area. Typing ALWAYS wins — the
 * moment the user edits a field the source flips to HUMAN_INPUT, because a human
 * statement outranks an auto-detected fix (CLAUDE.md SPATIAL).
 *
 * The device fix goes through the shared `useGeolocation` hook rather than a
 * second hand-rolled call: that hook deliberately asks for a coarse,
 * network-based fix (`enableHighAccuracy: false`) because a high-accuracy GPS
 * lock can genuinely take longer than any reasonable timeout indoors or on a
 * mid-range phone — asking for one here was timing out constantly for exactly
 * that reason.
 *
 * A raw coordinate is reverse-geocoded into city/area (same
 * `reverseGeocodeLocation` query the guest Location Setter uses) before it is
 * ever handed to `onChange`: the `location` step's server schema REQUIRES a
 * city, so a device fix that left it blank did not just look incomplete, it
 * failed to save with a validation error that read like a connection problem.
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
  const locale = useLocale();
  const apollo = useApolloClient();
  const { status, error, locate } = useGeolocation();
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const locating = status === 'locating' || resolvingPlace;

  // Written after commit, read once on mount below — see the effect for why.
  const latest = useRef({ value, onChange, locale });
  useEffect(() => {
    latest.current = { value, onChange, locale };
  });

  /** Fills city/area from a coordinate. Best-effort: a failed lookup still
   * saves the coordinate, and the fields stay there for the user to type. */
  async function withPlace(
    base: LocationValue,
    latitude: number,
    longitude: number,
  ): Promise<LocationValue> {
    const next: LocationValue = { ...base, latitude, longitude, source: 'DEVICE_GPS' };

    try {
      const { data } = await apollo.query<ReverseGeocodeQueryResult>({
        query: REVERSE_GEOCODE_QUERY,
        variables: { latitude, longitude, locale: latest.current.locale },
        fetchPolicy: 'cache-first',
      });

      const place = data?.reverseGeocodeLocation;
      if (place?.city) next.city = place.city;
      if (place?.locality) next.area = place.locality;
    } catch {
      // The coordinate is still worth saving without a name.
    }

    return next;
  }

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

    void withPlace(current, stored.latitude, stored.longitude).then(apply);
    // Runs once: this seeds an untouched step from the guest's prior fix, it is
    // not meant to re-fire as `value`/`onChange` identities change on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestCurrentLocation() {
    const fix = await locate();
    if (!fix) return;

    setResolvingPlace(true);
    try {
      onChange(await withPlace(value, fix.latitude, fix.longitude));
    } finally {
      setResolvingPlace(false);
    }
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
