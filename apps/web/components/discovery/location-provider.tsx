'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useApolloClient } from '@apollo/client/react';
import { useSession } from 'next-auth/react';
import {
  clampRadius,
  clearStoredLocation,
  formatArea,
  mergeLocation,
  readStoredLocation,
  subscribeToStoredLocation,
  writeStoredLocation,
  type BrowsingLocation,
} from '@/lib/geo';
import { REVERSE_GEOCODE_QUERY, type ReverseGeocodeQueryResult } from '@/lib/graphql/discovery';
import { restPost } from '@/lib/rest-api';

/**
 * The chosen browsing location, shared by every discovery surface (DIS-09).
 *
 * One provider rather than per-screen state because the location is a single
 * decision the user made once — CLAUDE.md: "the set location drives both feed
 * and search". Two screens holding their own copy is how a feed and a search end
 * up disagreeing about where the user is.
 *
 * It lives client-side deliberately. A guest has no account to store it against
 * (ACC-01) and must still get a located experience; for a signed-in user the
 * same value is additionally written to their profile, which is what makes it
 * follow them to another device.
 *
 * localStorage is read through `useSyncExternalStore` rather than copied into
 * state from an effect. It IS an external store — one that another tab can
 * write to — and treating it as one removes the hydration dance and gets
 * cross-tab sync as a side effect.
 */

interface LocationContextValue {
  location: BrowsingLocation | null;
  /** False during SSR and the first paint — do not render "no location" before this. */
  hydrated: boolean;
  /** True while a server sync is in flight. */
  saving: boolean;
  /**
   * True when an automatic fix was refused because a hand-placed pin is on file.
   * The UI turns this into an offer, never an error — the pin holding is the
   * correct outcome.
   */
  pinHeld: boolean;
  setFromDevice: (
    fix: { latitude: number; longitude: number },
    override?: boolean,
  ) => Promise<void>;
  setPin: (pin: { latitude: number; longitude: number; landmark?: string | null }) => Promise<void>;
  setRadius: (radiusM: number) => void;
  clear: () => void;
  dismissPinHeld: () => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

/** Never changes, so a mount-only "are we on the client yet" snapshot is stable. */
const NO_SUBSCRIBE = () => () => {};

export function LocationProvider({ children }: { children: ReactNode }) {
  const [saving, setSaving] = useState(false);
  const [pinHeld, setPinHeld] = useState(false);
  const apollo = useApolloClient();
  const { status } = useSession();

  const location = useSyncExternalStore(
    subscribeToStoredLocation,
    readStoredLocation,
    // The server has no localStorage, so it renders the unlocated view and the
    // client swaps in the stored location on hydration.
    () => null,
  );

  const hydrated = useSyncExternalStore(
    NO_SUBSCRIBE,
    () => true,
    () => false,
  );

  /**
   * Stores the location, then names it for display.
   *
   * Reverse-geocoding is best-effort and never blocks: the search runs on the
   * coordinate, and "somewhere you picked on the map" with results beats a
   * spinner while a label resolves.
   */
  const persist = useCallback(
    async (next: BrowsingLocation) => {
      writeStoredLocation(next);

      try {
        const { data } = await apollo.query<ReverseGeocodeQueryResult>({
          query: REVERSE_GEOCODE_QUERY,
          variables: { latitude: next.latitude, longitude: next.longitude },
          fetchPolicy: 'cache-first',
        });

        const place = data?.reverseGeocodeLocation;
        const label = formatArea({ area: place?.locality, city: place?.city });
        if (label) writeStoredLocation({ ...next, label });
      } catch {
        // The location still works unnamed. Nothing to report to the user.
      }
    },
    [apollo],
  );

  /**
   * Mirrors the location onto the signed-in user's profile.
   *
   * Fire-and-forget by design: the location has already taken effect locally, so
   * a failed sync must not block browsing or raise an error about something the
   * user did not ask for. The server applies the same human-pin rule.
   */
  const syncToServer = useCallback(
    async (next: BrowsingLocation, overrideHumanPin: boolean) => {
      if (status !== 'authenticated') return;

      setSaving(true);
      try {
        await restPost('geo/location', {
          latitude: next.latitude,
          longitude: next.longitude,
          source: next.source,
          landmark: next.landmark ?? null,
          overrideHumanPin,
        });
      } catch {
        // Local state is authoritative for this session; a retry happens the
        // next time the user sets a location.
      } finally {
        setSaving(false);
      }
    },
    [status],
  );

  const setFromDevice = useCallback(
    async (fix: { latitude: number; longitude: number }, override = false) => {
      const result = mergeLocation(
        readStoredLocation(),
        { latitude: fix.latitude, longitude: fix.longitude, source: 'DEVICE_GPS', landmark: null },
        { overrideHumanPin: override },
      );

      if (!result.applied) {
        // A hand-placed pin outranks the device (CLAUDE.md §SPATIAL). Offer the
        // swap; never perform it silently.
        setPinHeld(true);
        return;
      }

      setPinHeld(false);
      await persist(result.location);
      void syncToServer(result.location, override);
    },
    [persist, syncToServer],
  );

  const setPin = useCallback(
    async (pin: { latitude: number; longitude: number; landmark?: string | null }) => {
      const result = mergeLocation(readStoredLocation(), {
        latitude: pin.latitude,
        longitude: pin.longitude,
        source: 'HUMAN_INPUT',
        landmark: pin.landmark ?? null,
      });

      setPinHeld(false);
      await persist(result.location);
      // A pin the user just placed IS the explicit consent to replace whatever
      // was there before, including an older pin.
      void syncToServer(result.location, true);
    },
    [persist, syncToServer],
  );

  const setRadius = useCallback((radiusM: number) => {
    const current = readStoredLocation();
    if (!current) return;
    writeStoredLocation({ ...current, radiusM: clampRadius(radiusM) });
  }, []);

  const clear = useCallback(() => {
    setPinHeld(false);
    clearStoredLocation();
  }, []);

  const dismissPinHeld = useCallback(() => setPinHeld(false), []);

  const value = useMemo(
    () => ({
      location,
      hydrated,
      saving,
      pinHeld,
      setFromDevice,
      setPin,
      setRadius,
      clear,
      dismissPinHeld,
    }),
    [location, hydrated, saving, pinHeld, setFromDevice, setPin, setRadius, clear, dismissPinHeld],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useBrowsingLocation(): LocationContextValue {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useBrowsingLocation must be used inside a LocationProvider.');
  }
  return context;
}
