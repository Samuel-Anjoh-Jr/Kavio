'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * The browser Geolocation API, wrapped once (DIS-09).
 *
 * Only ever called from a user gesture. Browsers show the permission prompt at
 * whatever moment `getCurrentPosition` runs, and a prompt that appears on page
 * load — before the visitor knows what the site is — is the single most
 * reliable way to get permission denied forever. The one-tap button IS the
 * consent moment (CLAUDE.md: "explicit consent").
 */

export type GeolocationErrorCode =
  'unsupported' | 'permissionDenied' | 'positionUnavailable' | 'timeout' | 'unknown';

export interface GeolocationFix {
  latitude: number;
  longitude: number;
  /** Metres of uncertainty the device reports. Surfaced, never hidden. */
  accuracyM: number;
}

interface GeolocationState {
  status: 'idle' | 'locating' | 'ready' | 'error';
  error: GeolocationErrorCode | null;
}

/**
 * 10s timeout, and a 5-minute-old cached fix is accepted.
 *
 * Both numbers are tuned for a mid-range Android phone on 3G: a cold GPS lock
 * can genuinely take that long indoors, and accepting a recent cached fix means
 * the common case ("I tapped this two minutes ago") answers instantly instead of
 * spinning up the radio again.
 */
const OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 5 * 60 * 1000,
};

function toErrorCode(error: GeolocationPositionError): GeolocationErrorCode {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'permissionDenied';
    case error.POSITION_UNAVAILABLE:
      return 'positionUnavailable';
    case error.TIMEOUT:
      return 'timeout';
    default:
      return 'unknown';
  }
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({ status: 'idle', error: null });

  // Guards against a second tap while the first request is still open: two
  // concurrent prompts is a browser-dependent mess, and the user only asked once.
  const pending = useRef(false);

  const locate = useCallback((): Promise<GeolocationFix | null> => {
    if (pending.current) return Promise.resolve(null);

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({ status: 'error', error: 'unsupported' });
      return Promise.resolve(null);
    }

    pending.current = true;
    setState({ status: 'locating', error: null });

    return new Promise<GeolocationFix | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          pending.current = false;
          setState({ status: 'ready', error: null });
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyM: position.coords.accuracy,
          });
        },
        (error) => {
          pending.current = false;
          setState({ status: 'error', error: toErrorCode(error) });
          // Resolves rather than rejects: a denied permission is a normal
          // outcome of asking, not an exception, and every caller has a
          // perfectly good fallback (drop a pin).
          resolve(null);
        },
        OPTIONS,
      );
    });
  }, []);

  const reset = useCallback(() => setState({ status: 'idle', error: null }), []);

  return { ...state, locate, reset };
}
